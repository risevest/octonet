import { Container, decorate, injectable } from "inversify";
import { keyBy } from "lodash";
import nodecron from "node-cron";

export interface CronMetadata {
  name: string;
  constructor: any;
}

export interface QueryMetadata {
  name: string;
  method: string;
}

export interface JobMetadata {
  name: string;
  method: string;
  schedule: string;
  retries: number;
  timeout: string;
  lockPeriod: string;
}

export interface Job<T> {
  name: string;
  schedule: string;
  query?(): Promise<T[]>;
  job(t?: T): Promise<void>;
  retries: number;
  timeout: string;
  lockPeriod: string;
}

const queryKey = Symbol.for("cron.job.query");
const jobKey = Symbol.for("cron.job");
const cronKey = Symbol.for("cron");
const cronInstanceKey = Symbol.for("cron.instance");

/**
 * Tag a method as handler for hourly jobs
 * @param name name of the job. see `job`
 * @param retries number of times to retry failed jobs. set to 0 to run single attempts
 * @param timeout minimum timeout before first retry.
 * @param lockPeriod how long to lock job so it only one runs once. You won't need to set this unless
 * your job runs over short intervals(1s, 1m)
 */
export const hourly = (name: string, retries = 0, timeout = "10s", lockPeriod = "10s") =>
  job(name, "0 * * * *", retries, timeout, lockPeriod);

/**
 * Tag a method as handler for daily jobs
 * @param name name of the job. see `job`
 * @param retries number of times to retry failed jobs. set to 0 to run single attempts
 * @param timeout minimum timeout before first retry.
 * @param lockPeriod how long to lock job so it only one runs once. You won't need to set this unless
 * your job runs over short intervals(1s, 1m)
 */
export const daily = (name: string, retries = 0, timeout = "10s", lockPeriod = "10s") =>
  job(name, "0 0 * * *", retries, timeout, lockPeriod);

/**
 * Tag a method as handler for weekly jobs
 * @param name name of the job. see `job`
 * @param retries number of times to retry failed jobs. set to 0 to run single attempts
 * @param timeout minimum timeout before first retry.
 * @param lockPeriod how long to lock job so it only one runs once. You won't need to set this unless
 * your job runs over short intervals(1s, 1m)
 */
export const weekly = (name: string, retries = 0, timeout = "10s", lockPeriod = "10s") =>
  job(name, "0 0 * * Sun", retries, timeout, lockPeriod);
/**
 * Tag a method as handler for monthly jobs
 * @param name name of the job. see `job`
 * @param retries number of times to retry failed jobs. set to 0 to run single attempts
 * @param timeout minimum timeout before first retry.
 * @param lockPeriod how long to lock job so it only one runs once. You won't need to set this unless
 * your job runs over short intervals(1s, 1m)
 */
export const monthly = (name: string, retries = 0, timeout = "10s", lockPeriod = "10s") =>
  job(name, "0 0 1 * *", retries, timeout, lockPeriod);

/**
 * Tag a class as containing cron jobs
 * @param name name of the group of cron jobs. helps with referencing the job later
 */
export function cron(name: string) {
  return function (constructor: any) {
    decorate(injectable(), constructor);

    const cronGroups: CronMetadata[] = Reflect.getMetadata(cronKey, Reflect) || [];
    const allGroups = [{ name, constructor }, ...cronGroups];
    Reflect.defineMetadata(cronKey, allGroups, Reflect);
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
 * @param retries number of times to retry failed jobs. set to 0 to run single attempts
 * @param timeout minimum timeout before first retry.
 * @param lockPeriod how long to lock job so it only one runs once. You won't need to set this unless
 * your job runs over short intervals(1s, 1m)
 */
export function job(name: string, schedule: string, retries = 0, timeout = "10s", lockPeriod = "10s"): MethodDecorator {
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

    queries.push({ method, name, schedule, retries, timeout, lockPeriod });
  };
}

export function getJobs(container: Container) {
  const groups: CronMetadata[] = Reflect.getMetadata(cronKey, Reflect) || [];
  const jobs: Job<any>[] = [];

  groups.forEach(group => {
    if (container.isBoundNamed(cronInstanceKey, group.name)) {
      throw new Error("You can't declare multiple cron jobs groups using the same name");
    }

    container.bind<any>(cronInstanceKey).to(group.constructor).whenTargetNamed(group.name);

    const queryMetadata: QueryMetadata[] = Reflect.getMetadata(queryKey, group.constructor);
    const queryMap = keyBy(queryMetadata, "name");

    const jobMetadata: JobMetadata[] = Reflect.getMetadata(jobKey, group.constructor);
    jobMetadata.forEach(({ method, name, schedule, retries, timeout, lockPeriod }) => {
      const instance = container.getNamed<any>(cronInstanceKey, group.name);
      const possibleQuery = queryMap[name];
      const queryFn = !!possibleQuery ? instance[possibleQuery.method].bind(instance) : undefined;

      jobs.push({
        schedule,
        retries,
        timeout,
        lockPeriod,
        name: `${group.name.toLowerCase()}.${name}`,
        query: queryFn,
        job: instance[method].bind(instance)
      });
    });
  });

  return jobs;
}
