import { Container, decorate, injectable } from "inversify";
import { keyBy } from "lodash";
import nodecron from "node-cron";

import { collectMetadata } from "../mq/decorators";

export interface CronMetadata {
  name: string;
  constructor: any;
}

export interface QueryMetadata {
  name: string;
  method: string;
}

export interface JobMetadata extends JobConfig {
  name: string;
  method: string;
  schedule: string;
}

export interface JobConfig {
  /**
   * number of times to retry a job. set to 0 to not
   * retry
   */
  retries?: number;
  /**
   * minimum amount of time to wait between retries.
   */
  timeout?: string;
  /**
   * how long a simple job or query would take. Used to determine
   * how long to lock in distributed contexts. defaults to 1-hour
   */
  maxComputeTime?: string;
}

export interface Job<T> extends JobConfig {
  name: string;
  schedule: string;
  query?(): Promise<T[]>;
  job(t?: T): Promise<void>;
}

const queryKey = Symbol.for("cron.job.query");
const jobKey = Symbol.for("cron.job");
const cronKey = Symbol.for("cron");
const cronInstanceKey = Symbol.for("cron.instance");
const defaultJobConfig: JobConfig = {
  retries: 0,
  timeout: "10s",
  maxComputeTime: "1h"
};

/**
 * Tag a method as handler for hourly jobs
 * @param name name of the job. see `job`
 * @param config extra job configuration
 */
export const hourly = (name: string, config?: JobConfig) => job(name, "0 * * * *", config);

/**
 * Tag a method as handler for daily jobs
 * @param name name of the job. see `job`
 * @param config extra job configuration
 */
export const daily = (name: string, config?: JobConfig) => job(name, "0 0 * * *", config);

/**
 * Tag a method as handler for weekly jobs
 * @param name name of the job. see `job`
 * @param config extra job configuration
 */
export const weekly = (name: string, config?: JobConfig) => job(name, "0 0 * * Sun", config);
/**
 * Tag a method as handler for monthly jobs
 * @param name name of the job. see `job`
 * @param config extra job configuration
 */
export const monthly = (name: string, config?: JobConfig) => job(name, "0 0 1 * *", config);

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
 * @param config extra job configuration
 */
export function job(name: string, schedule: string, config?: JobConfig): MethodDecorator {
  if (!nodecron.validate(schedule)) {
    throw new Error(`${schedule} is not a valid cron expression`);
  }

  return function (prototype: any, method: string, _desc: PropertyDescriptor) {
    let jobs: JobMetadata[] = [];
    if (!Reflect.hasMetadata(jobKey, prototype.constructor)) {
      Reflect.defineMetadata(jobKey, jobs, prototype.constructor);
    } else {
      jobs = Reflect.getMetadata(jobKey, prototype.constructor);
    }

    jobs.push({ method, name, schedule, ...defaultJobConfig, ...config });
  };
}

export function getJobs(container: Container) {
  const groups = collectMetadata<CronMetadata[]>(cronKey, Reflect, []);
  const jobs: Job<any>[] = [];

  groups.forEach(group => {
    if (container.isBoundNamed(cronInstanceKey, group.name)) {
      throw new Error("You can't declare multiple cron jobs groups using the same name");
    }

    container.bind<any>(cronInstanceKey).to(group.constructor).whenTargetNamed(group.name);

    const queryMetadata = collectMetadata<QueryMetadata[]>(queryKey, group.constructor);
    const queryMap = keyBy(queryMetadata, "name");

    const jobMetadata = collectMetadata<JobMetadata[]>(jobKey, group.constructor);
    jobMetadata.forEach(({ method, name, schedule, retries, timeout, maxComputeTime }) => {
      const instance = container.getNamed<any>(cronInstanceKey, group.name);
      const possibleQuery = queryMap[name];
      const queryFn = !!possibleQuery ? instance[possibleQuery.method].bind(instance) : undefined;

      jobs.push({
        schedule,
        retries,
        timeout,
        maxComputeTime,
        name: `${group.name.toLowerCase()}.${name}`,
        query: queryFn,
        job: instance[method].bind(instance)
      });
    });
  });

  return jobs;
}
