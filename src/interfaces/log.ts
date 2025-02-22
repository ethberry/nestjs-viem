export interface ILogEvent<T = any> {
  name: string;
  args: T;
}
