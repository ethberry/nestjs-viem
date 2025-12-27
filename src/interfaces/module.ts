import { CronExpression } from "@nestjs/schedule";

export interface IViemModuleOptions {
  fromBlock: bigint;
  latency: bigint;
  debug: boolean;
  cron: CronExpression;
  chunkSize?: number;
}
