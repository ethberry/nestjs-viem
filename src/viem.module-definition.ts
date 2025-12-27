import { ConfigurableModuleBuilder } from "@nestjs/common";

import { IViemModuleOptions } from "./interfaces";

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IViemModuleOptions>().build();
