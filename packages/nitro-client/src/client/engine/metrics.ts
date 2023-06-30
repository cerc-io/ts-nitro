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

  // promjs doesnot have timer
  // Timer(name string) metrics.Timer
  timer(name: string): Gauge;

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
  timer(name: string): Gauge {
    return new Gauge();
  }

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

  timer(name: string): Gauge {
    assert(this.registry);
    const gauge = this.registry.get('gauge', name);
    if (gauge) {
      return gauge;
    }
    return this.registry.create('gauge', name);
  }

  recordPoint(name: string, value: number): void { }

  guage(name: string): Gauge {
    assert(this.registry);
    const gauge = this.registry.get('gauge', name);
    if (gauge) {
      return gauge;
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

  // RecordFunctionDuration records the duration of the function
  // It should be called at the start of the function like so  `defer e.metrics.RecordFunctionDuration()()`
  recordFunctionDuration(name: string): () => void {
    const start = new Date();
    return () => {
      const elapsed = new Date().getTime() - start.getTime();

      // Skip this function, and fetch the PC for its parent.
      // pc, _, _, _ := runtime.Caller(1)

      // Retrieve a function object this function's parent.
      // funcObj := runtime.FuncForPC(pc)

      // Use a regex to strip out the module path
      // funcNameRegex := regexp.MustCompile(`^.*\.(.*)$`)
      // name := funcNameRegex.ReplaceAllString(funcObj.Name(), "$1")

      // Get name of currently running function deprecated in javascript
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/caller
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/arguments/callee#description

      const timer = this.metrics!.timer(this.addMyAddress(name));
      timer!.add(elapsed / 1000);
    };
  }

  // RecordObjectiveStarted records metrics about the start of an objective
  // This should be called when an objective is first created
  recordObjectiveStarted(id: ObjectiveId): void {
    this.startTimes.set(id, new Date());
  }

  // RecordObjectiveCompleted records metrics about the completion of an objective
  // This should be called when an objective is completed
  recordObjectiveCompleted(id: ObjectiveId): void {
    const start = this.startTimes.get(id);
    assert(start);

    const elapsed = new Date().getTime() - start.getTime();
    const oType = id.split('-')[0];
    const timer = this.metrics?.timer(this.addMyAddress(`objective_complete_time,type=${oType}`));

    timer!.set(elapsed / 1000);
    this.startTimes.delete(id);
  }

  // RecordQueueLength records metrics about the length of some queue
  recordQueueLength(name: string, queueLength: number): void {
    assert(this.metrics);
    this.metrics.guage(this.addMyAddress(name)).set(queueLength);
  }

  private addMyAddress(name: string): string {
    return `${name},wallet=${this.me}`;
  }
}
