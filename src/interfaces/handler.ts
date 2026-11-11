// A controller method found by its pattern metadata (@EventPattern / @MessagePattern)
export interface IDiscoveredHandler<T> {
  meta: T;
  methodName: string;
  handler: (...args: any[]) => unknown;
  instance: object;
}
