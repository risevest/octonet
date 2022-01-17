import "reflect-metadata";

import { decorate, injectable } from "inversify";

import { eventGroupKey, eventHandlerKey } from "./constants";
import { EventGroupMeta, HandlerMeta } from "./interfaces";

/**
 * Declare a group of events with the same `prefix`.
 * @param prefix prefix used to name the events. Leave empty if group doesn't need
 * a prefix.
 */
export function eventGroup(prefix?: string): ClassDecorator {
  return function (constructor: Function) {
    // make the class injectable by default
    decorate(injectable(), constructor);

    const metadata: EventGroupMeta = { prefix, constructor };
    Reflect.defineMetadata(eventGroupKey, metadata, constructor);

    // add to global list of event groups
    const groupMetadata: EventGroupMeta[] = Reflect.getMetadata(eventGroupKey, Reflect) || [];
    const updatedGroupMetadata = [metadata, ...groupMetadata];
    Reflect.defineMetadata(eventGroupKey, updatedGroupMetadata, Reflect);
  };
}

/**
 * Call the given method whenever `event`(prefixed by the method's event group)
 * occurs
 * @param event name of the event to listen to
 */
export function handler(event: string): MethodDecorator {
  return function (prototype: any, method: string, _desc: PropertyDescriptor) {
    const group = prototype.constructor.name;
    const metadata: HandlerMeta = { event, group, method };

    let methodMetadata: HandlerMeta[] = [];
    if (!Reflect.hasMetadata(eventHandlerKey, prototype.constructor)) {
      Reflect.defineMetadata(eventHandlerKey, methodMetadata, prototype.constructor);
    } else {
      methodMetadata = Reflect.getMetadata(eventHandlerKey, prototype.constructor);
    }

    methodMetadata.push(metadata);
  };
}
