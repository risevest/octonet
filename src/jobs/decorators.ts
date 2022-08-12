import { Container, decorate, injectable } from "inversify";
import { keyBy } from "lodash";
import nodecron from "node-cron";

export interface QueryMetadata {
  name: string;
  method: string;
}

export interface JobMetadata {
  name: string;
  method: string;
  schedule: string;
}

export interface Job<T> {
  name: string;
  schedule: string;
  query?(): Promise<T[]>;
  job(t?: T): Promise<void>;
}

const queryKey = Symbol.for("cron.job.query");
const jobKey = Symbol.for("cron.job");
const cronKey = Symbol.for("cron");

/**
 * Tag a method as handler for hourly jobs
 * @param name name of the job. see `job`
 */
export const hourly = (name: string) => job(name, "0 * * * *");

/**
 * Tag a method as handler for daily jobs
 * @param name name of the job. see `job`
 */
export const daily = (name: string) => job(name, "0 0 * * *");

/**
 * Tag a method as handler for weekly jobs
 * @param name name of the job. see `job`
 */
export const weekly = (name: string) => job(name, "0 0 * * Sun");

/**
 * Tag a method as handler for monthly jobs
 * @param name name of the job. see `job`
 */
export const monthly = (name: string) => job(name, "0 0 1 * *");

/**
 * Tag a class as containing cron jobs
 */
export function cron() {
  return function (constructor: any) {
    decorate(injectable(), constructor);

    const constructors: any[] = Reflect.getMetadata(cronKey, Reflect) || [];
    const allConstructors = [constructor, ...constructors];
    Reflect.defineMetadata(cronKey, allConstructors, Reflect);
  };
}

/**
 * Tag a method for generating data to run a job
 * @param name name of the job this query generates data for. Make sure it's
 * the same name as the `job's`
 */
export function query(name: string): MethodDecorator {
  return function (prototype: any, method: string, _desc: PropertyDescriptor) {
    let queries: QueryMetadata[] = [];
    if (!Reflect.hasMetadata(queryKey, prototype.constructor)) {
      Reflect.defineMetadata(queryKey, queries, prototype.constructor);
    } else {
      queries = Reflect.getMetadata(queryKey, prototype.constructor);
    }

    queries.push({ method, name });
  };
}

/**
 * Tag a method running a job at a particular schedule
 * @param name name of the job this query generates data for. Make sure it's
 * the same name as the `query's`
 * @param schedule the cron schedule to use
 */
export function job(name: string, schedule: string): MethodDecorator {
  if (!nodecron.validate(schedule)) {
    throw new Error(`${schedule} is not a valid cron expression`);
  }

  return function (prototype: any, method: string, _desc: PropertyDescriptor) {
    let queries: JobMetadata[] = [];
    if (!Reflect.hasMetadata(jobKey, prototype.constructor)) {
      Reflect.defineMetadata(jobKey, queries, prototype.constructor);
    } else {
      queries = Reflect.getMetadata(jobKey, prototype.constructor);
    }

    queries.push({ method, name, schedule });
  };
}

export function getJobs(container: Container) {
  const genericTag = Symbol("constructor.instance");
  const constructors: any[] = Reflect.getMetadata(cronKey, Reflect) || [];
  const jobs: Job<any>[] = [];

  constructors.forEach(constructor => {
    if (container.isBoundNamed(genericTag, constructor.name)) {
      throw new Error("You can't declare multiple cron jobs groups using the same class or class name 😔");
    }

    container.bind<any>(genericTag).to(constructor).whenTargetNamed(constructor.name);

    const queryMetadata: QueryMetadata[] = Reflect.getMetadata(queryKey, constructor);
    const queryMap = keyBy(queryMetadata, "name");

    const jobMetadata: JobMetadata[] = Reflect.getMetadata(jobKey, constructor);
    jobMetadata.forEach(({ method, name, schedule }) => {
      const instance = container.getNamed<any>(genericTag, constructor.name);
      const jobFn = instance[method].bind(instance);
      const possibleQuery = queryMap[name];
      const queryFn = !!possibleQuery ? instance[possibleQuery.method].bind(instance) : undefined;
      const fullName = `${constructor.name.toLowerCase()}.${name}`;

      jobs.push({ name: fullName, schedule, query: queryFn, job: jobFn });
    });
  });

  return jobs;
}
