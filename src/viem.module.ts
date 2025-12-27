import { Logger, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DiscoveryModule } from "@golevelup/nestjs-discovery";

import { chainProvider, viemHttpClientProvider } from "./providers";
import { ViemService } from "./viem.service";
import { ConfigurableModuleClass } from "./viem.module-definition";

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
