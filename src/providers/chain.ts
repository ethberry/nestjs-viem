import { ConfigService } from "@nestjs/config";
import { defineChain } from "viem";

export const CHAIN_PROVIDER = Symbol("CHAIN_PROVIDER");

export const chainProvider = {
  provide: CHAIN_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const rpcUrl = configService.get<string>("RPC_URL", "http://localhost:8545/");
    const chainId = configService.get<string>("CHAIN_ID", "1");

    return defineChain({
      id: Number(chainId),
      name: "Besu",
      nativeCurrency: {
        name: "Besu",
        symbol: "BESU",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [rpcUrl],
        },
      },
    });
  },
};
