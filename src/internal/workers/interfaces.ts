export interface EventGroupMeta {
  prefix: string;
  constructor: Function;
}

export interface HandlerMeta {
  event: string;
  method: string;
  group: string;
}
