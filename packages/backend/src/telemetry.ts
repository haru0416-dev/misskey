/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { TextMapPropagator } from '@opentelemetry/api';
import type { Config, TelemetryInstrumentationName } from '@/config.js';

const DEFAULT_TRACE_SAMPLE_RATIO = 0.1;
const SHUTDOWN_TIMEOUT_MS = 3000;
type TelemetryProvider = { shutdown: () => Promise<void> };
let providers: TelemetryProvider[] = [];
let shutdownPromise: Promise<void> | undefined;
let recordExceptionImpl: (error: unknown) => void = () => {};
let traceHttpRequestImpl = (
	_request: Request,
	handler: () => Response | Promise<Response>,
): Response | Promise<Response> => handler();

export async function initializeTelemetry(config: Config): Promise<void> {
	const telemetry = config.observability.telemetry.backend;
	if (telemetry == null) {
		return;
	}

	const candidates: TelemetryProvider[] = [];
	try {
		const [api, core, exporter, resources, traceBase, traceNode, semanticConventions] = await Promise.all([
			import('@opentelemetry/api'),
			import('@opentelemetry/core'),
			import('@opentelemetry/exporter-trace-otlp-http'),
			import('@opentelemetry/resources'),
			import('@opentelemetry/sdk-trace-base'),
			import('@opentelemetry/sdk-trace-node'),
			import('@opentelemetry/semantic-conventions'),
		]);
		const resource = resources
			.resourceFromAttributes({
				[semanticConventions.ATTR_SERVICE_NAME]: telemetry.serviceName ?? 'toneriko-backend',
				[semanticConventions.ATTR_SERVICE_VERSION]: config.runtime.version,
				'service.instance.id': `${config.runtime.hostname}:${process.pid}`,
			})
			// NodeSDK のデフォルトと同じ検出器・同じ優先順位 (衝突時は検出側)。OTEL_RESOURCE_ATTRIBUTES などの環境変数と、
			// プロセス・ホストの属性を付ける。
			.merge(
				resources.detectResources({
					detectors: [resources.envDetector, resources.processDetector, resources.hostDetector],
				}),
			);
		const headers = telemetry.headers === undefined ? {} : { headers: telemetry.headers };
		const standardPropagator = new core.CompositePropagator({
			propagators: [new core.W3CTraceContextPropagator(), new core.W3CBaggagePropagator()],
		});
		// 受信した trace context は取り込むが、送信側へは付けない。Bun では node:http / fetch / ioredis の
		// 自動計装が span を出さないため、送信への伝播は行っていない。
		const extractionOnlyPropagator: TextMapPropagator = {
			inject: () => {},
			extract: (context, carrier, getter) => standardPropagator.extract(context, carrier, getter),
			fields: () => standardPropagator.fields(),
		};

		const tracerProvider = new traceNode.NodeTracerProvider({
			resource,
			sampler: new traceBase.TraceIdRatioBasedSampler(telemetry.tracesSampleRatio ?? DEFAULT_TRACE_SAMPLE_RATIO),
			spanProcessors: [
				new traceBase.BatchSpanProcessor(new exporter.OTLPTraceExporter({ url: telemetry.endpoint, ...headers })),
			],
		});
		candidates.push(tracerProvider);
		// 例外は標本化に関係なく必ず送る。
		const errorProvider = new traceBase.BasicTracerProvider({
			resource,
			sampler: new traceBase.AlwaysOnSampler(),
			spanProcessors: [
				new traceBase.BatchSpanProcessor(new exporter.OTLPTraceExporter({ url: telemetry.endpoint, ...headers })),
			],
		});
		candidates.push(errorProvider);

		// metrics の送り先は traces とは別に明示したときだけ使う。未設定なら計装を作らず何も送らない
		// (SDK デフォルトの localhost:4318 へは送らない)。
		if (telemetry.metricsEndpoint != null) {
			const meterProvider = await createMeterProvider(telemetry, telemetry.metricsEndpoint, resource, headers);
			if (meterProvider != null) {
				candidates.push(meterProvider);
			}
		}

		tracerProvider.register({ propagator: extractionOnlyPropagator });
		providers = candidates;
		const tracer = api.trace.getTracer('toneriko-backend');
		const errorTracer = errorProvider.getTracer('toneriko-backend-errors');
		const headerGetter = {
			keys: (requestHeaders: Headers) => [...requestHeaders.keys()],
			get: (requestHeaders: Headers, key: string) => requestHeaders.get(key) ?? undefined,
		};
		recordExceptionImpl = (error: unknown) => {
			const span = errorTracer.startSpan('unhandled exception');
			span.recordException(error instanceof Error ? error : String(error));
			span.setStatus({ code: api.SpanStatusCode.ERROR });
			span.end();
		};
		traceHttpRequestImpl = (request, handler) =>
			tracer.startActiveSpan(
				`HTTP ${request.method}`,
				{
					kind: api.SpanKind.SERVER,
					attributes: {
						'http.request.method': request.method,
						'server.address': config.runtime.hostname,
					},
				},
				api.propagation.extract(api.context.active(), request.headers, headerGetter),
				async (span) => {
					try {
						const response = await handler();
						span.setAttribute('http.response.status_code', response.status);
						if (response.status >= 500) {
							span.setStatus({ code: api.SpanStatusCode.ERROR });
						}
						return response;
					} catch (error) {
						span.recordException(error instanceof Error ? error : String(error));
						span.setStatus({ code: api.SpanStatusCode.ERROR });
						recordExceptionImpl(error);
						throw error;
					} finally {
						span.end();
					}
				},
			);
	} catch (error) {
		console.error('Failed to initialize OpenTelemetry; Toneriko will continue without telemetry.', error);
		if (candidates.length > 0) {
			await shutdownWithTimeout(candidates);
		}
	}
}

async function createMeterProvider(
	telemetry: NonNullable<Config['observability']['telemetry']['backend']>,
	metricsEndpoint: string,
	resource: import('@opentelemetry/resources').Resource,
	headers: { headers?: Record<string, string> },
): Promise<TelemetryProvider | null> {
	const [api, instrumentation, metricsExporter, sdkMetrics, runtimeNode, hostMetrics] = await Promise.all([
		import('@opentelemetry/api'),
		import('@opentelemetry/instrumentation'),
		import('@opentelemetry/exporter-metrics-otlp-http'),
		import('@opentelemetry/sdk-metrics'),
		import('@opentelemetry/instrumentation-runtime-node'),
		import('@opentelemetry/instrumentation-host-metrics'),
	]);
	const meterProvider = new sdkMetrics.MeterProvider({
		resource,
		readers: [
			new sdkMetrics.PeriodicExportingMetricReader({
				exporter: new metricsExporter.OTLPMetricExporter({ url: metricsEndpoint, ...headers }),
			}),
		],
	});
	const instrumentationFactories = {
		'@opentelemetry/instrumentation-runtime-node': () => new runtimeNode.RuntimeNodeInstrumentation(),
		'@opentelemetry/instrumentation-host-metrics': () => new hostMetrics.HostMetricsInstrumentation(),
	};
	const instrumentations = Object.entries(instrumentationFactories)
		.filter(([name]) =>
			isInstrumentationEnabled(name as TelemetryInstrumentationName, telemetry.disabledInstrumentations ?? []),
		)
		.flatMap(([, create]) => {
			try {
				return [create()];
			} catch (error) {
				api.diag.error('Failed to initialize an OpenTelemetry instrumentation.', error);
				return [];
			}
		});
	instrumentation.registerInstrumentations({ meterProvider, instrumentations });
	return meterProvider;
}

function isInstrumentationEnabled(
	name: TelemetryInstrumentationName,
	disabled: readonly TelemetryInstrumentationName[],
): boolean {
	const shortName = name.replace('@opentelemetry/instrumentation-', '');
	const disabledByEnvironment = (process.env['OTEL_NODE_DISABLED_INSTRUMENTATIONS'] ?? '')
		.split(',')
		.map((value) => value.trim());
	if (disabled.includes(name) || disabledByEnvironment.includes(shortName)) {
		return false;
	}
	const enabledByEnvironment = process.env['OTEL_NODE_ENABLED_INSTRUMENTATIONS'];
	if (enabledByEnvironment) {
		return enabledByEnvironment
			.split(',')
			.map((value) => value.trim())
			.includes(shortName);
	}
	return name !== '@opentelemetry/instrumentation-host-metrics';
}

export function recordException(error: unknown): void {
	try {
		recordExceptionImpl(error);
	} catch (telemetryError) {
		console.error('Failed to record an exception with OpenTelemetry.', telemetryError);
	}
}

export function traceHttpRequest(
	request: Request,
	handler: () => Response | Promise<Response>,
): Response | Promise<Response> {
	return traceHttpRequestImpl(request, handler);
}

export async function shutdownTelemetry(): Promise<void> {
	if (shutdownPromise != null) {
		return shutdownPromise;
	}

	const activeProviders = providers;
	providers = [];
	recordExceptionImpl = () => {};
	traceHttpRequestImpl = (_request, handler) => handler();
	if (activeProviders.length === 0) {
		return;
	}

	shutdownPromise = shutdownWithTimeout(activeProviders);
	return shutdownPromise;
}

async function shutdownWithTimeout(activeProviders: TelemetryProvider[]): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const shutdownAll = Promise.allSettled(activeProviders.map((provider) => provider.shutdown())).then((results) => {
			for (const result of results) {
				if (result.status === 'rejected') {
					console.error('Failed to shut down an OpenTelemetry provider cleanly.', result.reason);
				}
			}
		});
		await Promise.race([
			shutdownAll,
			new Promise<void>((resolve) => {
				timeout = setTimeout(() => {
					console.error(`OpenTelemetry shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms; continuing process shutdown.`);
					resolve();
				}, SHUTDOWN_TIMEOUT_MS);
				timeout.unref();
			}),
		]);
	} catch (error) {
		console.error('Failed to shut down OpenTelemetry cleanly.', error);
	} finally {
		if (timeout != null) {
			clearTimeout(timeout);
		}
	}
}
