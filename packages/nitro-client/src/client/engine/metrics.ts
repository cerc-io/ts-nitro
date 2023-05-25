// MetricsAPI is an interface for recording metrics
// It is heavily based on https://github.com/testground/sdk-go/blob/master/runtime/metrics_api.go
// It exposes some basic functionality that is useful for recording engine metrics
// TODO: Add interface fields
export interface MetricsApi {}

// NewNoOpMetrics returns a MetricsApi that does nothing.
// TODO: Implement
export class NoOpMetrics {}

// MetricsRecorder is used to record metrics about the engine
// TODO: Implement
export class MetricsRecorder {}
