import { Controller, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Ctx, EventPattern, Payload } from "@nestjs/microservices";
import { CronExpression, SchedulerRegistry } from "@nestjs/schedule";

import type { IBlockEvent, ILogEvent, IViemModuleOptions } from "./interfaces";
import { BLOCK_EVENT, VIEM_CLIENT } from "./viem.constants";
import { ViemModule } from "./viem.module";
import { ViemService } from "./viem.service";

@Controller()
class BlockController {
  public readonly seen: Array<{ event: ILogEvent<IBlockEvent>; ctx: IBlockEvent }> = [];

  @EventPattern({ eventName: BLOCK_EVENT })
  public onBlock(@Payload() event: ILogEvent<IBlockEvent>, @Ctx() ctx: IBlockEvent): void {
    this.seen.push({ event, ctx });
  }
}

function moduleOptions(fromBlock: bigint, latency: bigint): IViemModuleOptions {
  return {
    fromBlock,
    latency,
    debug: false,
    cron: CronExpression.EVERY_YEAR,
  };
}

function testModule(options: IViemModuleOptions, controllers: Array<typeof BlockController>) {
  @Module({
    imports: [ViemModule.register(options)],
    controllers,
  })
  class TestViemModule {}

  return TestViemModule;
}

async function createModule(
  client: { getBlockNumber: jest.Mock; getLogs: jest.Mock },
  options: IViemModuleOptions,
  controllers: Array<typeof BlockController> = [],
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(), testModule(options, controllers)],
  })
    .overrideProvider(VIEM_CLIENT)
    .useValue(client)
    .compile();

  await moduleRef.init();
  moduleRef
    .get(SchedulerRegistry)
    .getCronJobs()
    .forEach(job => job.stop());
  return moduleRef;
}

async function drain(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !ready(); attempt++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe("block events", function () {
  const modules: Array<TestingModule> = [];

  afterEach(async function () {
    await Promise.all(modules.splice(0).map(moduleRef => moduleRef.close()));
  });

  it("should keep the cursor when nobody listens for blocks", async function () {
    const getBlockNumber = jest.fn();
    const options = moduleOptions(4n, 0n);
    const moduleRef = await createModule({ getBlockNumber, getLogs: jest.fn() }, options);
    modules.push(moduleRef);

    await moduleRef.get(ViemService).listen();

    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(options.fromBlock).toBe(4n);
  });

  it("should emit the fresh head and keep the log cursor behind latency", async function () {
    const getBlockNumber = jest.fn().mockResolvedValueOnce(10n).mockResolvedValueOnce(11n);
    const options = moduleOptions(7n, 2n);
    const moduleRef = await createModule({ getBlockNumber, getLogs: jest.fn() }, options, [BlockController]);
    modules.push(moduleRef);
    const seen = moduleRef.get(BlockController).seen;

    await moduleRef.get(ViemService).listen();
    await drain(() => seen.length === 1);

    expect(seen.map(item => item.event.args.blockNumber)).toEqual([10n]);
    expect(seen.map(item => item.event.name)).toEqual([BLOCK_EVENT]);
    expect(seen.map(item => item.ctx.blockNumber)).toEqual([10n]);
    expect(options.fromBlock).toBe(9n);

    await moduleRef.get(ViemService).listen();
    await drain(() => seen.length === 2);

    expect(seen.map(item => item.event.args.blockNumber)).toEqual([10n, 11n]);
    expect(options.fromBlock).toBe(10n);
  });

  it("should keep scanning contracts when no block handler is registered", async function () {
    const getLogs = jest.fn().mockResolvedValue([]);
    const getBlockNumber = jest.fn().mockResolvedValue(5n);
    const options = moduleOptions(5n, 0n);
    const moduleRef = await createModule({ getBlockNumber, getLogs }, options);
    modules.push(moduleRef);
    const service = moduleRef.get(ViemService);
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
