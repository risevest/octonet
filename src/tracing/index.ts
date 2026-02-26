export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags?: number;
}

export interface TracingProvider {
  /**
   * Returns the active trace context, or null if no span is active.
   */
  getActiveTraceContext(): TraceContext | null;
}
