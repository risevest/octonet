import "reflect-metadata";

import { Container, decorate, injectable } from "inversify";

type Constructor = new (...args: never[]) => any;

/**
 * Metadata extracted by group decorator
 */
export interface Group {
  /**
   * optional tag for the group
   */
  tag?: string;
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
}

/**
 * A bounded handler function(meaning access to dependencies) with metadata
 */
export interface ParsedHandler {
  /**
   * tag passed to the method
   */
  method_tag: string;
  /**
   * tag declared at the group
   */
  group_tag?: string;
  /**
   * bounded handler function.
   */
  handler: Function;
}

/**
 * Create a decorator for capturing a group of handlers. Note that it also makes
 * the class injectable for the sake of dependency inversion.
 * @param s namespace to store metadata
 */
export function groupDecorator(s: Symbol) {
  return function group(tag?: string) {
    return function (constructor: Constructor) {
      // make the class injectable by default
      decorate(injectable(), constructor);

      const metadata: Group = { tag, constructor };
      Reflect.defineMetadata(s, metadata, constructor);

      // add to global list of event groups
      const groupMetadata: Group[] = Reflect.getMetadata(s, Reflect) || [];
      const updatedGroupMetadata = [metadata, ...groupMetadata];
      Reflect.defineMetadata(s, updatedGroupMetadata, Reflect);
    };
  };
}

export function handlerDecorator(s: Symbol) {
  return function handler(tag: string): MethodDecorator {
    return function (prototype: any, method: string, _desc: PropertyDescriptor) {
      const className = prototype.constructor.name;
      const metadata: Handler = { tag, class_name: className, method };

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

  groups.forEach(({ tag: groupTag, constructor }) => {
    const name = constructor.name;
    if (container.isBoundNamed(groupInstanceTag, name)) {
      throw new Error("You can't declare groups using the same class");
    }

    container.bind<any>(groupInstanceTag).to(constructor).whenTargetNamed(name);

    const methodMeta: Handler[] = Reflect.getMetadata(handlerKey, constructor);
    methodMeta.forEach(({ tag, method, class_name }) => {
      const instance = container.getNamed(groupInstanceTag, class_name);
      const handlerFn = instance[method].bind(instance);
      handlers.push({ method_tag: tag, group_tag: groupTag, handler: handlerFn });
    });
  });

  return handlers;
}
