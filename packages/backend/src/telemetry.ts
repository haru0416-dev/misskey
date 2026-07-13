/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ClientRequest } from 'node:http';
import type { Context, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import type { Config, TelemetryInstrumentationName } from '@/config.js';

const DEFAULT_TRACE_SAMPLE_RATIO = 0.1;
const SHUTDOWN_TIMEOUT_MS = 3000;
type TelemetryProvider = { shutdown: () => Promise<void> };
let providers: TelemetryProvider[] = [];
let shutdownPromise: Promise<void> | undefined;
let recordExceptionImpl: (error: unknown) => void = () => {};
let traceHttpRequestImpl = async (_request: Request, handler: () => Response | Promise<Response>): Promise<Response> => handler();

export function shouldPropagateTraceContext(target: string | URL, configuredTargets: readonly string[]): boolean {
	let targetUrl: URL;
	try {
		targetUrl = typeof target === 'string' ? new URL(target) : target;
	} catch {
		return false;
	}

	return configuredTargets.some(configuredTarget => {
		const allowedUrl = new URL(configuredTarget);
		if (targetUrl.origin !== allowedUrl.origin) return false;
		if (allowedUrl.pathname === '/' && allowedUrl.search === '') return true;
		return targetUrl.href.startsWith(allowedUrl.href);
	});
}

export async function initializeTelemetry(config: Config): Promise<void> {
	const telemetry = config.telemetryForBackend;
	if (telemetry == null) return;

	const candidates: TelemetryProvider[] = [];
	try {
		const [api, autoInstrumentations, exporter, resources, sdkNode, traceBase, semanticConventions] = await Promise.all([
			import('@opentelemetry/api'),
			import('@opentelemetry/auto-instrumentations-node'),
			import('@opentelemetry/exporter-trace-otlp-http'),
			import('@opentelemetry/resources'),
			import('@opentelemetry/sdk-node'),
			import('@opentelemetry/sdk-trace-base'),
			import('@opentelemetry/semantic-conventions'),
		]);
		const resource = resources.resourceFromAttributes({
			[semanticConventions.ATTR_SERVICE_NAME]: telemetry.serviceName ?? 'misskey-backend',
			[semanticConventions.ATTR_SERVICE_VERSION]: config.version,
			'service.instance.id': `${config.hostname}:${process.pid}`,
		});
		const exporterOptions = {
			url: telemetry.endpoint,
			headers: telemetry.headers,
		};
		const standardPropagator = new sdkNode.core.CompositePropagator({
			propagators: [
				new sdkNode.core.W3CTraceContextPropagator(),
				new sdkNode.core.W3CBaggagePropagator(),
			],
		});
		const extractionOnlyPropagator: TextMapPropagator = {
			inject: () => {},
			extract: (context, carrier, getter) => standardPropagator.extract(context, carrier, getter),
			fields: () => standardPropagator.fields(),
		};
		const propagationTargets = telemetry.tracePropagationTargets ?? [];
		const injectIfAllowed = (target: string | URL, context: Context, carrier: unknown, setter: TextMapSetter): void => {
			if (
				shouldPropagateTraceContext(target, propagationTargets) &&
				!shouldPropagateTraceContext(target, [telemetry.endpoint])
			) standardPropagator.inject(context, carrier, setter);
		};
		const instrumentationConfig: InstrumentationConfigMap = {
			'@opentelemetry/instrumentation-dns': { enabled: false },
			'@opentelemetry/instrumentation-fs': { enabled: false },
			'@opentelemetry/instrumentation-net': { enabled: false },
			'@opentelemetry/instrumentation-http': {
				requestHook: (span, request) => {
					if (!isClientRequest(request)) return;
					const target = new URL(request.path, `${request.protocol}//${request.host}`);
					injectIfAllowed(target, api.trace.setSpan(api.context.active(), span), request, {
						set: (carrier: ClientRequest, key, value) => carrier.setHeader(key, value),
					});
				},
			},
			'@opentelemetry/instrumentation-undici': {
				requestHook: (span, request) => {
					injectIfAllowed(new URL(request.path, request.origin), api.trace.setSpan(api.context.active(), span), request, {
						set: (carrier, key, value) => carrier.addHeader(key, value),
					});
				},
			},
		};
		for (const name of telemetry.disabledInstrumentations ?? []) disableInstrumentation(instrumentationConfig, name);
		const candidate = new sdkNode.NodeSDK({
			resource,
			sampler: new traceBase.TraceIdRatioBasedSampler(telemetry.tracesSampleRatio ?? DEFAULT_TRACE_SAMPLE_RATIO),
			traceExporter: new exporter.OTLPTraceExporter(exporterOptions),
			textMapPropagator: extractionOnlyPropagator,
			instrumentations: [autoInstrumentations.getNodeAutoInstrumentations(instrumentationConfig)],
		});
		candidates.push(candidate);
		const errorProvider = new traceBase.BasicTracerProvider({
			resource,
			sampler: new traceBase.AlwaysOnSampler(),
			spanProcessors: [new traceBase.BatchSpanProcessor(new exporter.OTLPTraceExporter(exporterOptions))],
		});
		candidates.push(errorProvider);
		candidate.start();
		providers = candidates;
		const tracer = api.trace.getTracer('misskey-backend');
		const errorTracer = errorProvider.getTracer('misskey-backend-errors');
		const headerGetter = {
			keys: (headers: Headers) => [...headers.keys()],
			get: (headers: Headers, key: string) => headers.get(key) ?? undefined,
		};
		recordExceptionImpl = (error: unknown) => {
			const span = errorTracer.startSpan('unhandled exception');
			span.recordException(error instanceof Error ? error : String(error));
			span.setStatus({ code: api.SpanStatusCode.ERROR });
			span.end();
		};
		traceHttpRequestImpl = (request, handler) => tracer.startActiveSpan(`HTTP ${request.method}`, {
			kind: api.SpanKind.SERVER,
			attributes: {
				'http.request.method': request.method,
				'server.address': new URL(request.url).hostname,
			},
		}, api.propagation.extract(api.context.active(), request.headers, headerGetter), async span => {
			try {
				const response = await handler();
				span.setAttribute('http.response.status_code', response.status);
				if (response.status >= 500) span.setStatus({ code: api.SpanStatusCode.ERROR });
				return response;
			} catch (error) {
				span.recordException(error instanceof Error ? error : String(error));
				span.setStatus({ code: api.SpanStatusCode.ERROR });
				recordExceptionImpl(error);
				throw error;
			} finally {
				span.end();
			}
		});
	} catch (error) {
		console.error('Failed to initialize OpenTelemetry; Misskey will continue without telemetry.', error);
		if (candidates.length > 0) await shutdownWithTimeout(candidates);
	}
}

function isClientRequest(request: ClientRequest | import('node:http').IncomingMessage): request is ClientRequest {
	return 'setHeader' in request && 'path' in request && 'protocol' in request && 'host' in request;
}

function disableInstrumentation(config: InstrumentationConfigMap, name: TelemetryInstrumentationName): void {
	config[name] = { enabled: false };
}

export function recordException(error: unknown): void {
	try {
		recordExceptionImpl(error);
	} catch (telemetryError) {
		console.error('Failed to record an exception with OpenTelemetry.', telemetryError);
	}
}

export function traceHttpRequest(request: Request, handler: () => Response | Promise<Response>): Promise<Response> {
	return traceHttpRequestImpl(request, handler);
}

export async function shutdownTelemetry(): Promise<void> {
	if (shutdownPromise != null) return shutdownPromise;

	const activeProviders = providers;
	providers = [];
	recordExceptionImpl = () => {};
	traceHttpRequestImpl = async (_request, handler) => handler();
	if (activeProviders.length === 0) return;

	shutdownPromise = shutdownWithTimeout(activeProviders);
	return shutdownPromise;
}

async function shutdownWithTimeout(activeProviders: TelemetryProvider[]): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const shutdownAll = Promise.allSettled(activeProviders.map(provider => provider.shutdown())).then(results => {
			for (const result of results) {
				if (result.status === 'rejected') console.error('Failed to shut down an OpenTelemetry provider cleanly.', result.reason);
			}
		});
		await Promise.race([
			shutdownAll,
			new Promise<void>(resolve => {
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
		if (timeout != null) clearTimeout(timeout);
	}
}
