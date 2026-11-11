import type { PublicClient } from "viem";
import { Chain, createPublicClient, http } from "viem";

import { VIEM_CLIENT } from "../viem.constants.js";
import { CHAIN_PROVIDER } from "./chain.js";

export const viemHttpClientProvider = {
  provide: VIEM_CLIENT,
  inject: [CHAIN_PROVIDER],
  useFactory: (chain: Chain): PublicClient => {
    return createPublicClient({
      chain: chain,
      transport: http(),
    });
  },
};
