import { Logger, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";

import { chainProvider, viemHttpClientProvider } from "./providers/index.js";
import { ViemService } from "./viem.service.js";
import { ConfigurableModuleClass } from "./viem.module-definition.js";

@Module({
  imports: [ConfigModule, DiscoveryModule, ScheduleModule.forRoot()],
  providers: [chainProvider, viemHttpClientProvider, Logger, ViemService],
  exports: [ViemService],
})
export class ViemModule extends ConfigurableModuleClass implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly viemService: ViemService) {
    super();
  }

  public onModuleInit(): void {
    return this.viemService.init();
  }

  public onModuleDestroy(): void {
    return this.viemService.destroy();
  }
}
