import { Attributes } from "@opentelemetry/api";
import { DataPoint, MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics";

class TestReader extends MetricReader {
  protected async onForceFlush() {}
  protected async onShutdown() {}
}

export function testMeter() {
  const reader = new TestReader();
  const provider = new MeterProvider({ readers: [reader] });
  return { reader, provider, meter: provider.getMeter("test") };
}

export async function collect(reader: MetricReader) {
  const { resourceMetrics, errors } = await reader.collect();
  if (errors.length > 0) {
    throw errors[0];
  }

  const metrics = resourceMetrics.scopeMetrics.flatMap(s => s.metrics);
  return function points<T = number>(name: string, attrs: Attributes = {}): DataPoint<T>[] {
    return metrics
      .filter(m => m.descriptor.name === name)
      .flatMap(m => m.dataPoints as DataPoint<T>[])
      .filter(p => Object.entries(attrs).every(([k, v]) => p.attributes[k] === v));
  };
}
