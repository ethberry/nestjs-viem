import { Controller, Injectable, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Ctx, EventPattern, Payload } from "@nestjs/microservices";
import { CronExpression } from "@nestjs/schedule";
import { config } from "dotenv";
import { Abi } from "abitype";

import { patchBigInt, waitForConfirmation } from "./utils";
import type { IContractOptions, ILogEvent, IModuleOptions } from "./interfaces";
import { ViemModule } from "./viem.module";
import { ViemService } from "./viem.service";

import Erc20Contract from "./contracts/ERC20Ownable.json";
import Erc721Contract from "./contracts/ERC721Ownable.json";
import ExchangeContract from "./contracts/Exchange.json";
import type { Hash, Log } from "viem";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface IExchangeItem {
  account: string;
  token: string;
  tokenId: bigint;
}

interface IExchangePrice {
  account: string;
  token: string;
  amount: bigint;
}

interface IERC20ApprovalEvent {
  owner: string;
  spender: string;
  value: string;
}

interface IERC20TransferEvent {
  from: string;
  to: string;
  value: string;
}

interface IERC721ApprovalEvent {
  owner: string;
  to: string;
  tokenId: string;
}

interface IERC721TransferEvent {
  from: string;
  to: string;
  tokenId: string;
}

interface IOwnershipTransferred {
  previousOwner: string;
  newOwner: string;
}

interface IExchangeSwapEvent {
  item: IExchangeItem;
  price: IExchangePrice;
}

export enum ContractType {
  EXCHANGE = "EXCHANGE",
  ERC20_TOKEN = "ERC20_TOKEN",
  ERC721_TOKEN = "ERC721_TOKEN",
}

config();
patchBigInt();

const AMOUNT = 10000000n;
const TOKEN_ID = 1n;

@Injectable()
class TestViemService {
  constructor(private readonly viemService: ViemService) {}

  public updateRegistry(contract: IContractOptions): void {
    return this.viemService.updateRegistry(contract);
  }

  public getRegistry(): Array<IContractOptions> {
    return this.viemService.getRegistry();
  }

  public async logEvent(
    event: ILogEvent<
      | IERC20ApprovalEvent
      | IERC20TransferEvent
      | IERC721ApprovalEvent
      | IERC721TransferEvent
      | IOwnershipTransferred
      | IExchangeSwapEvent
    >,
    ctx: Log,
  ): Promise<void> {
    // console.info("event", event.name);
    // console.info("args", JSON.stringify(event.args));
    // console.info("ctx", ctx);
    // console.info(
    //   parseInt(ctx.blockNumber.toString(), 16),
    //   parseInt(ctx.transactionIndex.toString(), 16),
    //   parseInt(ctx.logIndex.toString(), 16),
    // );
    await Promise.resolve({ event, ctx });
  }
}

@Controller()
class TestViemController {
  constructor(private readonly testViemService: TestViemService) {}

  @EventPattern([
    {
      contractType: ContractType.ERC20_TOKEN,
      eventName: "OwnershipTransferred",
    },
    {
      contractType: ContractType.ERC721_TOKEN,
      eventName: "OwnershipTransferred",
    },
  ])
  public logEvent1(@Payload() event: ILogEvent<IOwnershipTransferred>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.ERC20_TOKEN,
    eventName: "Approval",
  })
  public logEvent2(@Payload() event: ILogEvent<IERC20ApprovalEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.ERC20_TOKEN,
    eventName: "Transfer",
  })
  public logEvent3(@Payload() event: ILogEvent<IERC20TransferEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.ERC721_TOKEN,
    eventName: "Approval",
  })
  public logEvent4(@Payload() event: ILogEvent<IERC721ApprovalEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.ERC721_TOKEN,
    eventName: "Transfer",
  })
  public logEvent5(@Payload() event: ILogEvent<IERC721TransferEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.EXCHANGE,
    eventName: "Swap",
  })
  public logEvent6(@Payload() event: ILogEvent<IExchangeSwapEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }

  @EventPattern({
    contractType: ContractType.EXCHANGE,
    eventName: "Swap",
  })
  public logEvent7(@Payload() event: ILogEvent<IExchangeSwapEvent>, @Ctx() ctx: Log): Promise<void> {
    return this.testViemService.logEvent(event, ctx);
  }
}

@Module({
  imports: [ViemModule.deferred()],
  providers: [TestViemService],
  controllers: [TestViemController],
  exports: [TestViemService],
})
class TestViemModule {}

describe("ViemServer", function () {
  // https://github.com/facebook/jest/issues/11543
  jest.setTimeout(100000);

  let logSpyContract: jest.SpyInstance;

  let testViemService: TestViemService;

  beforeEach(async function () {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: `.env`,
        }),
        ViemModule.forRootAsync(ViemModule, {
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (configService: ConfigService): Promise<IModuleOptions> => {
            const latency = ~~configService.get<string>("LATENCY", "1");
            const fromBlock = ~~configService.get<string>("STARTING_BLOCK", "0");
            return Promise.resolve({
              latency: BigInt(latency),
              fromBlock: BigInt(fromBlock),
              debug: true,
              chunkSize: 100,
              cron: CronExpression.EVERY_SECOND,
            });
          },
        }),
        TestViemModule,
      ],
    }).compile();

    testViemService = module.get<TestViemService>(TestViemService);
    logSpyContract = jest.spyOn(testViemService, "logEvent");

    await module.init();
  });

  afterEach(function () {
    logSpyContract.mockClear();
  });

  it("should receive Event", async function () {
    const ethberry = defineChain({
      id: 10000,
      name: "Besu",
      nativeCurrency: {
        name: "Besu",
        symbol: "BESU",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [process.env.JSON_RPC_ADDR],
        },
      },
    });

    const publicClient = createPublicClient({
      chain: ethberry,
      transport: http(process.env.JSON_RPC_ADDR),
    });

    const walletClient = createWalletClient({
      chain: ethberry,
      transport: http(process.env.JSON_RPC_ADDR),
    });

    const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hash);

    const exchangeHash = await walletClient.deployContract({
      account,
      abi: ExchangeContract.abi,
      bytecode: ExchangeContract.bytecode as Hash,
    });
    const exchangeReceipt = await publicClient.waitForTransactionReceipt({ hash: exchangeHash });
    const exchangeAddress = exchangeReceipt.contractAddress;

    const priceHash = await walletClient.deployContract({
      account,
      abi: Erc20Contract.abi,
      bytecode: Erc20Contract.bytecode as Hash,
      args: ["name", "symbol"],
    });
    const priceReceipt = await publicClient.waitForTransactionReceipt({ hash: priceHash });
    const priceAddress = priceReceipt.contractAddress;

    const mintHash = await walletClient.writeContract({
      account,
      address: priceAddress!,
      abi: Erc20Contract.abi,
      functionName: "mint",
      args: [process.env.ACCOUNT, AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    const approveHash = await walletClient.writeContract({
      account,
      address: priceAddress!,
      abi: Erc20Contract.abi,
      functionName: "approve",
      args: [exchangeAddress, AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const itemHash = await walletClient.deployContract({
      account,
      abi: Erc721Contract.abi,
      bytecode: Erc721Contract.bytecode as Hash,
      args: ["name", "symbol"],
    });
    const itemReceipt = await publicClient.waitForTransactionReceipt({ hash: itemHash });
    const itemAddress = itemReceipt.contractAddress;

    const mintNftHash = await walletClient.writeContract({
      account,
      address: itemAddress!,
      abi: Erc721Contract.abi,
      functionName: "mint",
      args: [process.env.ACCOUNT, TOKEN_ID],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintNftHash });

    const approveNftHash = await walletClient.writeContract({
      account,
      address: itemAddress!,
      abi: Erc721Contract.abi,
      functionName: "approve",
      args: [exchangeAddress, TOKEN_ID],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveNftHash });

    const swapHash = await walletClient.writeContract({
      account,
      address: exchangeAddress!,
      abi: ExchangeContract.abi,
      functionName: "swap",
      args: [
        { account: process.env.ACCOUNT, token: itemAddress, tokenId: TOKEN_ID },
        { account: process.env.ACCOUNT, token: priceAddress, amount: AMOUNT },
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: swapHash });

    testViemService.updateRegistry({
      contractType: ContractType.ERC20_TOKEN,
      contractAddress: [priceAddress!],
      contractInterface: Erc20Contract.abi as Abi,
      eventSignatures: [
        "Transfer(address,address,uint256)",
        "Approval(address,address,uint256)",
        "OwnershipTransferred(address,address)",
      ],
    });
    testViemService.updateRegistry({
      contractType: ContractType.ERC721_TOKEN,
      contractAddress: [itemAddress!],
      contractInterface: Erc721Contract.abi as Abi,
      eventSignatures: [
        "Transfer(address,address,uint256)",
        "Approval(address,address,uint256)",
        "OwnershipTransferred(address,address)",
      ],
    });
    testViemService.updateRegistry({
      contractType: ContractType.EXCHANGE,
      contractAddress: [exchangeAddress!],
      contractInterface: ExchangeContract.abi as Abi,
      eventSignatures: ["Swap((address,address,uint256),(address,address,uint256))"],
    });

    await waitForConfirmation(publicClient, ~~process.env.LATENCY + 2);

    expect(logSpyContract).toBeCalledTimes(10);
  });
});
