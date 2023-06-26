import prom, { RegistryType } from 'promjs';
import { Gauge } from 'promjs/gauge';
import assert from 'assert';

import { Address } from '../../types/types';
import { ObjectiveId } from '../../protocols/messages';

// MetricsAPI is an interface for recording metrics
// It is heavily based on https://github.com/testground/sdk-go/blob/master/runtime/metrics_api.go
// It exposes some basic functionality that is useful for recording engine metrics
export interface MetricsApi {
  // RecordPoint records a float64 point under the provided metric name + tags.
  //
  // The format of the metric name is a comma-separated list, where the first
  // element is the metric name, and optionally, an unbounded list of
  // key-value pairs. Example:
  //
  //   requests_received,tag1=value1,tag2=value2,tag3=value3
  recordPoint(name: string, value: number): void;

  // Timer creates a measurement of timer type.
  // The returned type is an alias of go-metrics' Timer type. Refer to
  // godocs there for details.
  //
  // The format of the metric name is a comma-separated list, where the first
  // element is the metric name, and optionally, an unbounded list of
  // key-value pairs. Example:
  //
  //   requests_received,tag1=value1,tag2=value2,tag3=value3

  // TODO: Implement
  // promjs doesnot have timer
  // Timer(name string) metrics.Timer
  timer(name: string): void

  // Gauge creates a measurement of gauge type (float64).
  // The returned type is an alias of go-metrics' GaugeFloat64 type. Refer to
  // godocs there for details.
  //
  // The format of the metric name is a comma-separated list, where the first
  // element is the metric name, and optionally, an unbounded list of
  // key-value pairs. Example:
  //
  //   requests_received,tag1=value1,tag2=value2,tag3=value3
  guage(name: string): Gauge;
}

// NewNoOpMetrics returns a MetricsApi that does nothing.
export class NoOpMetrics implements MetricsApi {
  timer(name: string): void {}

  recordPoint(name: string, value: number): void {}

  guage(name: string): Gauge {
    return new Gauge();
  }
}

export interface GetMetricsString {
  metrics: string;
}

export interface GetMetrics {
  [key: string]: number;
}
export class Metrics implements MetricsApi {
  registry?: RegistryType;

  constructor() {
    this.registry = prom();
  }

  timer(name: string): void {}

  recordPoint(name: string, value: number): void { }

  guage(name: string): Gauge {
    assert(this.registry);
    if (this.registry.get('gauge', name)) {
      return this.registry.get('gauge', name)!;
    }
    return this.registry.create('gauge', name);
  }

  getMetricsString(): GetMetricsString {
    assert(this.registry);
    return {
      metrics: this.registry.metrics(),
    };
  }

  getMetrics(): GetMetrics {
    const obj = (this.registry as any).data;

    const result: { [key: string]: number } = {};
    /* eslint-disable guard-for-in */

    for (const key in obj.gauge) {
      const { instance } = obj.gauge[key];
      const { value } = instance.data[0];
      result[key] = value;
    }

    return result;
  }
}

// MetricsRecorder is used to record metrics about the engine
export class MetricsRecorder {
  me: Address = '';

  startTimes: Map<ObjectiveId, Date> = new Map();

  metrics?: MetricsApi;

  constructor(params: {
    me: Address;
    startTimes?: Map<ObjectiveId, Date>;
    metrics: MetricsApi;
  }) {
    Object.assign(this, params);
  }

  // NewMetricsRecorder returns a new MetricsRecorder that uses the metricsApi to record metrics
  static newMetricsRecorder(me: Address, metrics: MetricsApi): MetricsRecorder {
    return new MetricsRecorder({
      me,
      startTimes: new Map(),
      metrics,
    });
  }

  // TODO: Implement
  // RecordFunctionDuration records the duration of the function
  // It should be called at the start of the function like so  `defer e.metrics.RecordFunctionDuration()()`
  recordFunctionDuration(): () => void {
    return () => {};
  }

  // RecordObjectiveStarted records metrics about the start of an objective
  // This should be called when an objective is first created
  recordObjectiveStarted(id: ObjectiveId): void {
    this.startTimes.set(id, new Date());
  }

  // TODO: Implement
  // RecordObjectiveCompleted records metrics about the completion of an objective
  // This should be called when an objective is completed
  recordObjectiveCompleted(id: ObjectiveId): void {}

  // RecordQueueLength records metrics about the length of some queue
  recordQueueLength(name: string, queueLength: number): void {
    assert(this.metrics);
    this.metrics.guage(this.addMyAddress(name)).set(queueLength);
  }

  private addMyAddress(name: string): string {
    return `${name},wallet=${this.me}`;
  }
}
