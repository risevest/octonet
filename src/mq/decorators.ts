import "reflect-metadata";

import { Container, decorate, injectable } from "inversify";

import { Middleware } from "./handlers";

type Constructor = new (...args: never[]) => any;

/**
 * Metadata extracted by group decorator
 */
export interface Group {
  /**
   * tag for the group
   */
  tag: string;
  /**
   * middlewares for all handlers in the group
   */
  middleware: Middleware[];
  /**
   * constructor of the class
   */
  constructor: Constructor;
}

/**
 * Metadata extracted by the handler decorator
 */
export interface Handler {
  /**
   * a tag for the handler
   */
  tag: string;
  /**
   * name of the method
   */
  method: string;
  /**
   * name of the class the method belongs to
   */
  class_name: string;
  /**
   * middleware for the specific handler
   */
  middleware: Middleware[];
}

/**
 * A bounded handler function(meaning access to dependencies) with metadata
 */
export interface ParsedHandler {
  /**
   * tag for the group
   */
  group_tag: string;
  /**
   * tag for the specific handler
   */
  handler_tag: string;
  /**
   * all the middleware defined for the group
   */
  group_middleware: Middleware[];
  /**
   * all the middleware defined for the handler
   */
  handler_middleware: Middleware[];
  /**
   * bounded handler function.
   */
  handler: Function;
}

/**
 * Create a decorator for capturing a group of handlers. Note that it also makes
 * the class injectable for the sake of dependency inversion. The decorator accepts
 * middleware.
 * @param s namespace to store metadata
 */
export function groupDecorator(s: Symbol) {
  return function group(tag: string, ...middleware: Middleware[]) {
    return function (constructor: Constructor) {
      // make the class injectable by default
      decorate(injectable(), constructor);

      const metadata: Group = { tag, middleware, constructor };
      Reflect.defineMetadata(s, metadata, constructor);

      // add to global list of event groups
      const groupMetadata: Group[] = Reflect.getMetadata(s, Reflect) || [];
      const updatedGroupMetadata = [metadata, ...groupMetadata];
      Reflect.defineMetadata(s, updatedGroupMetadata, Reflect);
    };
  };
}

/**
 * Create a decorator for capturing a single handler that has been defined as a method
 * in group of handlers.. The decorator accepts a tag for the handler(event or subject) and
 * middleware.
 * @param s namespace to store metadata
 */
export function handlerDecorator(s: Symbol) {
  return function handler(tag: string, ...middleware: Middleware[]): MethodDecorator {
    return function (prototype: any, method: string, _desc: PropertyDescriptor) {
      const className = prototype.constructor.name;
      const metadata: Handler = { tag, class_name: className, method, middleware };

      let methodMetadata: Handler[] = [];
      if (!Reflect.hasMetadata(s, prototype.constructor)) {
        Reflect.defineMetadata(s, methodMetadata, prototype.constructor);
      } else {
        methodMetadata = Reflect.getMetadata(s, prototype.constructor);
      }

      methodMetadata.push(metadata);
    };
  };
}

export function parseHandlers(container: Container, groupKey: Symbol, handlerKey: Symbol) {
  const groupInstanceTag = Symbol("group.instance");
  const groups: Group[] = Reflect.getMetadata(groupKey, Reflect) || [];
  const handlers: ParsedHandler[] = [];

  groups.forEach(({ tag: groupTag, middleware: groupMiddleware, constructor }) => {
    if (container.isBoundNamed(groupInstanceTag, groupTag)) {
      throw new Error("You can't declare groups using the same class");
    }

    container.bind<any>(groupInstanceTag).to(constructor).whenTargetNamed(groupTag);

    const methodMeta: Handler[] = Reflect.getMetadata(handlerKey, constructor);
    methodMeta.forEach(({ tag, method, middleware }) => {
      const instance = container.getNamed(groupInstanceTag, groupTag);
      const handlerFn = instance[method].bind(instance);

      handlers.push({
        group_tag: groupTag,
        handler_tag: tag,
        group_middleware: groupMiddleware,
        handler_middleware: middleware,
        handler: handlerFn
      });
    });
  });

  return handlers;
}
