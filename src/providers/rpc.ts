import { ConfigService } from "@nestjs/config";

import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";

import { VIEM_CLIENT } from "../viem.constants";
import { getChain } from "../utils/chains";

export const viemClientProvider = {
  provide: VIEM_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): PublicClient => {
    const rpcUrl = configService.get<string>("JSON_RPC_ADDR", "http://127.0.0.1:8545/");
    const chainId = ~~configService.get<string>("CHAIN_ID", "1");
    return createPublicClient({
      chain: getChain(chainId),
      transport: http(rpcUrl),
    });
  },
};
