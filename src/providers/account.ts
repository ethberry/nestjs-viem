import { ConfigService } from "@nestjs/config";
import { privateKeyToAccount } from "viem/accounts";
import { Hash } from "viem";

import { VIEM_ACCOUNT } from "../viem.constants";

export const viemAccountProvider = {
  provide: VIEM_ACCOUNT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const privateKey = configService.get<Hash>("PRIVATE_KEY", "0x");
    return privateKeyToAccount(privateKey);
  },
};
