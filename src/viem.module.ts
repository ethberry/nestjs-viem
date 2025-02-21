import { DynamicModule, Logger, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { createConfigurableDynamicRootModule } from "@golevelup/nestjs-modules";
import { DiscoveryModule } from "@golevelup/nestjs-discovery";

import { viemRpcProvider } from "./providers";
import { ViemService } from "./viem.service";
import { IModuleOptions } from "./interfaces";
import { MODULE_OPTIONS_PROVIDER } from "./viem.constants";

@Module({
  imports: [ConfigModule, DiscoveryModule, ScheduleModule.forRoot()],
  providers: [viemRpcProvider, Logger, ViemService],
  exports: [ViemService],
})
export class ViemModule
  extends createConfigurableDynamicRootModule<ViemModule, IModuleOptions>(MODULE_OPTIONS_PROVIDER)
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly viemService: ViemService) {
    super();
  }

  static deferred = (): Promise<DynamicModule> => ViemModule.externallyConfigured(ViemModule, 0);

  public onModuleInit(): void {
    return this.viemService.init();
  }

  public onModuleDestroy(): void {
    return this.viemService.destroy();
  }
}
