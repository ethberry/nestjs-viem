export interface ILogEvent<T = any> {
  eventName: string;
  args: T;
}
