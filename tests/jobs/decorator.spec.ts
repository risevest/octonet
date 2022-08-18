import "reflect-metadata";

import { expect } from "chai";
import { Container } from "inversify";
import { keyBy } from "lodash";
import sinon from "sinon";

import { JobMetadata, QueryMetadata, getJobs } from "../../src";
import {
  CronGroup,
  GroupTag,
  NeedsCronGroup,
  NeedsGroupTag,
  cronKey,
  jobKey,
  normalSpy,
  queryKey
} from "./helpers/decorators";

afterEach(() => {
  sinon.resetHistory();
});

describe("Decorators#cron", () => {
  it("should save a class as a cron group", () => {
    const constructors: any[] = Reflect.getMetadata(cronKey, Reflect);

    expect(constructors).to.have.length(1);
    const [constructor] = constructors;

    expect(constructor.name).to.eq(CronGroup.name);
    expect(constructor).to.be.a("function");
  });

  it("should make the class injectable", () => {
    const container = new Container();
    container.bind<CronGroup>(GroupTag).to(CronGroup);
    container.bind<NeedsCronGroup>(NeedsGroupTag).to(NeedsCronGroup);

    const needsGroupInstance = container.get<NeedsCronGroup>(NeedsGroupTag);
    expect(needsGroupInstance.cron).to.be.instanceOf(CronGroup);
  });
});

describe("Decorators#query", () => {
  it("should save a method as a query", () => {
    const queries: QueryMetadata[] = Reflect.getMetadata(queryKey, CronGroup);

    expect(queries.length).to.eq(1);
    const [query] = queries;

    expect(query.name).to.eq("data");
    expect(query.method).to.eq("generateData");
  });
});

describe("Decorators#job", () => {
  it("should capture methods as jobs", () => {
    const jobs: JobMetadata[] = Reflect.getMetadata(jobKey, CronGroup);

    expect(jobs.length).to.eq(2);
    const jobMap = keyBy(jobs, "name");

    expect(jobMap["normal"].method).to.eq("normalJob");
    expect(jobMap["normal"].schedule).to.eq("0 0 * * *");

    expect(jobMap["data"].method).to.eq("scheduledJob");
    expect(jobMap["data"].schedule).to.eq("0 23 * * *");
  });
});

describe("Decorators#getJob", () => {
  it("generate jobs from loaded code", () => {
    const jobs = getJobs(new Container());
    const prefix = CronGroup.name.toLowerCase();

    expect(jobs).to.have.length(2);
    const jobMap = keyBy(jobs, "name");

    expect(jobMap[`${prefix}.normal`].query).to.undefined;
    expect(jobMap[`${prefix}.normal`].schedule).to.eq("0 0 * * *");
    expect(jobMap[`${prefix}.normal`].retries).to.eq(2);
    expect(jobMap[`${prefix}.normal`].timeout).to.eq("5s");

    expect(jobMap[`${prefix}.data`].query).to.be.a("function");
    expect(jobMap[`${prefix}.data`].schedule).to.eq("0 23 * * *");
    expect(jobMap[`${prefix}.data`].retries).to.eq(3);
    expect(jobMap[`${prefix}.data`].timeout).to.eq("10s");
  });

  it("should ensure the handler still acts like a method", () => {
    const jobs = getJobs(new Container());
    const jobMap = keyBy(jobs, "name");

    const prefix = CronGroup.name.toLowerCase();
    const normalJob = jobMap[`${prefix}.normal`];

    normalJob.job();
    expect(normalSpy.called).to.be.true;
    expect(normalSpy.firstCall.firstArg).to.eq(0);
  });
});
