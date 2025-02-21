import { Inject, Injectable, Logger, LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageHandler } from "@nestjs/microservices";
import { transformPatternToRoute } from "@nestjs/microservices/utils";
import { PATTERN_METADATA } from "@nestjs/microservices/constants";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { EMPTY, from, Observable, Subject } from "rxjs";
import { mergeAll, mergeMap } from "rxjs/operators";
import { DiscoveredMethodWithMeta, DiscoveryService } from "@golevelup/nestjs-discovery";

import { getPastEvents } from "./utils/get-past-events";
import { VIEM_CLIENT, MODULE_OPTIONS_PROVIDER } from "./viem.constants";
import { IContractOptions, ILogEvent, IModuleOptions } from "./interfaces";
import { decodeEventLog, Hash, PublicClient } from "viem";

@Injectable()
export class ViemService {
  private instanceId: string;
  private cronLock = false;
  private toBlock = 0n;
  private registry: Array<IContractOptions> = [];
  private subject = new Subject<any>();

  constructor(
    @Inject(Logger)
    protected readonly loggerService: LoggerService,
    @Inject(VIEM_CLIENT)
    protected readonly client: PublicClient,
    protected readonly discoveryService: DiscoveryService,
    protected readonly configService: ConfigService,
    @Inject(MODULE_OPTIONS_PROVIDER)
    protected options: IModuleOptions,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.subject
      .pipe(mergeMap(({ pattern, description, log }) => from(this.call(pattern, description, log)).pipe(mergeAll()), 1))
      .subscribe({
        next: v => {
          loggerService.log(v, `${ViemService.name}-${this.instanceId}`);
        },
        error: e => {
          loggerService.error(e);
        },
        complete: () => {
          loggerService.log("complete", `${ViemService.name}-${this.instanceId}`);
        },
      });
  }

  public init(): void {
    // generate instance id
    this.instanceId = (Math.random() + 1).toString(36).substring(7);
    // setup cron job
    return this.setCronJob();
  }

  public setCronJob(): void {
    const job = new CronJob(this.options.cron, async () => {
      // if previous cron task still running - skip
      if (this.cronLock) {
        return;
      }
      this.cronLock = true;
      await this.listen();
      this.cronLock = false;
    });

    this.schedulerRegistry.addCronJob(`ethListener_${this.instanceId}`, job);
    job.start();
  }

  public async listen(): Promise<void> {
    // wait while the system is configured
    if (!this.registry.length) {
      return;
    }

    this.toBlock = (await this.getLastBlock()) - this.options.latency;
    // waiting for confirmation
    if (this.options.fromBlock > this.toBlock) {
      return;
    }

    this.loggerService.log(
      `getPastEvents No: ${this.options.fromBlock} - ${this.toBlock}`,
      `${ViemService.name}-${this.instanceId}`,
    );

    await this.getPastEvents(this.registry, this.options.fromBlock, this.toBlock, this.options.chunkSize);
    this.options.fromBlock = this.toBlock + 1n;
  }

  public async getPastEvents(
    registry: Array<IContractOptions>,
    fromBlock: bigint,
    toBlock: bigint,
    chunkSize?: number,
  ): Promise<void> {
    const allAddress = registry.reduce<Array<Hash>>(
      (memo, current) => memo.concat(current.contractAddress as Array<Hash>),
      [],
    );
    const allSignatures = registry.reduce<Array<string>>((memo, current) => memo.concat(current.eventSignatures), []);

    const logs = await getPastEvents(this.client, allAddress, allSignatures, fromBlock, toBlock, chunkSize).catch(e => {
      this.loggerService.error(JSON.stringify(e, null, "\t"), `${ViemService.name}-${this.instanceId}`);
      return [];
    });

    for (const log of logs) {
      for (const entry of registry) {
        if (!entry.contractAddress.map(a => a.toLowerCase()).includes(log.address.toLowerCase())) {
          continue;
        }

        const logDescription = decodeEventLog({
          abi: entry.contractInterface,
          data: log.data,
          topics: log.topics,
        });

        // LOG PROBLEMS IF ANY
        if (!logDescription) {
          if (this.options.debug) {
            this.loggerService.log("CAN'T PARSE LOG", `${ViemService.name}-${this.instanceId}`);
            this.loggerService.log(JSON.stringify(log, null, "\t"), `${ViemService.name}-${this.instanceId}`);
          }
          continue;
        }

        this.loggerService.log(JSON.stringify(logDescription, null, "\t"), `${ViemService.name}-${this.instanceId}`);

        this.subject.next({
          pattern: {
            contractType: entry.contractType,
            eventName: logDescription.eventName,
          },
          description: logDescription,
          log,
        });
      }
    }
  }

  public updateRegistry(contract: IContractOptions): void {
    const entry = this.registry.find(e => e.contractType === contract.contractType);

    if (entry) {
      entry.contractAddress = [...new Set([...entry.contractAddress, ...contract.contractAddress])];
      entry.eventSignatures = [...new Set([...entry.eventSignatures, ...contract.eventSignatures])];
    } else {
      this.registry.push(contract);
    }

    this.loggerService.log(
      `ETH Listener updated: ${contract.contractAddress.join(", ")}`,
      `${ViemService.name}-${this.instanceId}`,
    );
  }

  public getRegistry(): Array<IContractOptions> {
    return this.registry;
  }

  public async getLastBlock(): Promise<bigint> {
    return await this.client.getBlockNumber().catch(err => {
      this.loggerService.error(JSON.stringify(err, null, "\t"), `${ViemService.name}-${this.instanceId}`);
      return 0n;
    });
  }

  protected async getHandlerByPattern<T extends Array<Record<string, string>>>(
    route: string,
  ): Promise<Array<DiscoveredMethodWithMeta<T>>> {
    const methods = await this.discoveryService.controllerMethodsWithMetaAtKey<T>(PATTERN_METADATA);
    return methods.filter(method => {
      return method.meta.some(meta => transformPatternToRoute(meta) === route);
    });
  }

  protected async call(
    pattern: Record<string, string>,
    description: ILogEvent,
    context?: any,
  ): Promise<Observable<any>> {
    const route = transformPatternToRoute(pattern);
    const discoveredMethodsWithMeta = await this.getHandlerByPattern(route);

    if (!discoveredMethodsWithMeta.length) {
      this.loggerService.log(`Handler not found for: ${route}`, `${ViemService.name}-${this.instanceId}`);
      return Promise.resolve(EMPTY);
    }

    return Promise.allSettled(
      discoveredMethodsWithMeta.map(discoveredMethodWithMeta => {
        return (
          discoveredMethodWithMeta.discoveredMethod.handler.bind(
            discoveredMethodWithMeta.discoveredMethod.parentClass.instance,
          ) as MessageHandler
        )(description, context);
      }),
    ).then(res => {
      res.forEach(r => {
        if (r.status === "rejected") {
          this.loggerService.error(r.reason, `${ViemService.name}-${this.instanceId}`);
        }
      });
      return from(["OK"]);
    });
  }

  public getLastProcessedBlock() {
    return this.toBlock;
  }

  public destroy(): void {
    this.subject.complete();
  }
}
