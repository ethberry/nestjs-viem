import { CronExpression } from "@nestjs/schedule";

export interface IModuleOptions {
  fromBlock: bigint;
  latency: bigint;
  debug: boolean;
  cron: CronExpression;
  chunkSize?: number;
}
