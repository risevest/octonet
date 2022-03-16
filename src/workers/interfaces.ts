export interface EventGroupMeta {
  prefix: string;
  constructor: Function;
}

export interface HandlerMeta {
  event: string;
  method: string;
  group: string;
}

export interface NatsStreamMeta {
  stream: string;
  constructor: Function;
}

export interface NatsHandlerMeta {
  event: string;
  method: string;
  streamGroup: string;
}

export interface NatsHandlerObject {
  handlerFunction: Function;
  subject: string;
}
