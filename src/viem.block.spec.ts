import type { LoggerService } from "@nestjs/common";
import { CronExpression, SchedulerRegistry } from "@nestjs/schedule";
import type { DiscoveryService } from "@golevelup/nestjs-discovery";
import type { PublicClient } from "viem";

import type { IBlockEvent, ILogEvent, IViemModuleOptions } from "./interfaces";
import { BLOCK_EVENT } from "./viem.constants";
import { ViemService } from "./viem.service";

function moduleOptions(fromBlock: bigint, latency: bigint): IViemModuleOptions {
  return {
    fromBlock,
    latency,
    debug: false,
    cron: CronExpression.EVERY_SECOND,
  };
}

function createService(
  client: PublicClient,
  methods: Array<unknown>,
  options: IViemModuleOptions,
): ViemService {
  const discovery = {
    controllerMethodsWithMetaAtKey: (): Promise<Array<unknown>> => Promise.resolve(methods),
  };

  return new ViemService(
    { log: () => undefined, error: () => undefined } as unknown as LoggerService,
    client,
    discovery as unknown as DiscoveryService,
    options,
    {} as SchedulerRegistry,
  );
}

function blockMethod(seen: Array<{ event: ILogEvent<IBlockEvent>; ctx: IBlockEvent }>): {
  meta: Array<{ eventName: string }>;
  discoveredMethod: {
    handler: (event: ILogEvent<IBlockEvent>, ctx: IBlockEvent) => void;
    parentClass: { instance: Record<string, never> };
  };
} {
  return {
    meta: [{ eventName: BLOCK_EVENT }],
    discoveredMethod: {
      handler(event: ILogEvent<IBlockEvent>, ctx: IBlockEvent): void {
        seen.push({ event, ctx });
      },
      parentClass: { instance: {} },
    },
  };
}

async function drain(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !ready(); attempt++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe("block events", function () {
  const services: Array<ViemService> = [];

  afterEach(function () {
    services.splice(0).forEach(service => service.destroy());
  });

  it("should keep the cursor when nobody listens for blocks", async function () {
    const getBlockNumber = jest.fn();
    const options = moduleOptions(4n, 0n);
    const service = createService({ getBlockNumber, getLogs: jest.fn() } as unknown as PublicClient, [], options);
    services.push(service);

    await service.listen();

    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(options.fromBlock).toBe(4n);
  });

  it("should emit the fresh head and keep the log cursor behind latency", async function () {
    const seen: Array<{ event: ILogEvent<IBlockEvent>; ctx: IBlockEvent }> = [];
    const getBlockNumber = jest.fn().mockResolvedValueOnce(10n).mockResolvedValueOnce(12n);
    const options = moduleOptions(7n, 2n);
    const service = createService(
      { getBlockNumber, getLogs: jest.fn() } as unknown as PublicClient,
      [blockMethod(seen)],
      options,
    );
    services.push(service);

    await service.listen();
    await drain(() => seen.length === 1);

    expect(seen.map(item => item.event.args.blockNumber)).toEqual([10n]);
    expect(seen.map(item => item.event.name)).toEqual([BLOCK_EVENT]);
    expect(seen.map(item => item.ctx.blockNumber)).toEqual([10n]);
    expect(options.fromBlock).toBe(9n);

    await service.listen();
    await drain(() => seen.length === 3);

    expect(seen.map(item => item.event.args.blockNumber)).toEqual([10n, 11n, 12n]);
    expect(options.fromBlock).toBe(11n);
  });

  it("should keep scanning contracts when no block handler is registered", async function () {
    const getLogs = jest.fn().mockResolvedValue([]);
    const getBlockNumber = jest.fn().mockResolvedValue(5n);
    const options = moduleOptions(5n, 0n);
    const service = createService({ getBlockNumber, getLogs } as unknown as PublicClient, [], options);
    services.push(service);
    service.updateRegistry({
      contractType: "ERC20_TOKEN",
      contractAddress: ["0x0000000000000000000000000000000000000001"],
      contractInterface: [],
      eventSignatures: ["Transfer(address,address,uint256)"],
    });

    await service.listen();

    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 5n,
        toBlock: 5n,
      }),
    );
    expect(options.fromBlock).toBe(6n);
  });
});
