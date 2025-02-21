import { ConfigService } from "@nestjs/config";
import { privateKeyToAccount } from "viem/accounts";

import { VIEM_ACCOUNT } from "../viem.constants";

export const viemAccountProvider = {
  provide: VIEM_ACCOUNT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const privateKey = configService.get<string>("PRIVATE_KEY", "0x");
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    return account;
  },
};
