/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { AlwaysOnSampler, BatchSpanProcessor, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { App } from 'vue';
import { createFetchTelemetryUrlPatterns, redactTelemetryUrl } from '@/utility/telemetry-url.js';

const DEFAULT_TRACE_SAMPLE_RATIO = 0.1;

type FrontendTelemetryConfig = {
	endpoint: string;
	serviceName?: string;
	tracesSampleRatio?: number;
	propagateTraceHeaderCorsUrls?: string[];
};

export function initializeFrontendTelemetry(
	config: FrontendTelemetryConfig,
	app: App<Element>,
	version: string,
	apiUrl: string,
): void {
	const exporter = new OTLPTraceExporter({ url: config.endpoint });
	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: config.serviceName ?? 'erebia-frontend',
		[ATTR_SERVICE_VERSION]: version,
	});
	const provider = new WebTracerProvider({
		resource,
		sampler: new TraceIdRatioBasedSampler(config.tracesSampleRatio ?? DEFAULT_TRACE_SAMPLE_RATIO),
		spanProcessors: [new BatchSpanProcessor(exporter, { disableAutoFlushOnDocumentHide: true })],
	});
	const errorProvider = new WebTracerProvider({
		resource,
		sampler: new AlwaysOnSampler(),
		spanProcessors: [
			new BatchSpanProcessor(new OTLPTraceExporter({ url: config.endpoint }), { disableAutoFlushOnDocumentHide: true }),
		],
	});
	provider.register();

	const urlPatterns = createFetchTelemetryUrlPatterns(apiUrl, config.propagateTraceHeaderCorsUrls);
	const setRedactedUrlAttributes = (span: Span, value?: string) => {
		const redactedUrl = value == null ? '[redacted]' : redactTelemetryUrl(value);
		span.setAttribute(ATTR_URL_FULL, redactedUrl);
		span.setAttribute('http.url', redactedUrl);
	};
	registerInstrumentations({
		tracerProvider: provider,
		instrumentations: [
			new FetchInstrumentation({
				propagateTraceHeaderCorsUrls: [urlPatterns.allowed],
				ignoreUrls: [urlPatterns.ignored],
				clearTimingResources: true,
				requestHook: (span, request) => {
					setRedactedUrlAttributes(span, request instanceof Request ? request.url : undefined);
				},
				applyCustomAttributesOnSpan: (span, request, result) => {
					const resultUrl = 'url' in result ? result.url : undefined;
					setRedactedUrlAttributes(span, resultUrl ?? (request instanceof Request ? request.url : undefined));
				},
			}),
		],
	});

	let lifecycleOperation = Promise.resolve();
	const runLifecycleOperation = (operation: () => Promise<void>) => {
		lifecycleOperation = lifecycleOperation.then(operation).catch((error) => {
			console.error('Failed to flush frontend OpenTelemetry data.', error);
		});
	};
	window.document.addEventListener('visibilitychange', () => {
		if (window.document.visibilityState === 'hidden') {
			runLifecycleOperation(async () => {
				await Promise.all([provider.forceFlush(), errorProvider.forceFlush()]);
			});
		}
	});
	window.addEventListener('pagehide', (event) => {
		runLifecycleOperation(async () => {
			await Promise.all(
				event.persisted
					? [provider.forceFlush(), errorProvider.forceFlush()]
					: [provider.shutdown(), errorProvider.shutdown()],
			);
		});
	});

	const tracer = errorProvider.getTracer('erebia-frontend-errors', version);
	const reportException = (error: unknown, source: string) => {
		const span = tracer.startSpan(source);
		span.recordException(error instanceof Error ? error : String(error));
		span.setStatus({ code: SpanStatusCode.ERROR });
		span.end();
	};

	const previousErrorHandler = app.config.errorHandler;
	app.config.errorHandler = (error, instance, info) => {
		reportException(error, `Vue error: ${info}`);
		if (previousErrorHandler != null) previousErrorHandler(error, instance, info);
		else console.error(error);
	};
	window.addEventListener('error', (event) => reportException(event.error ?? event.message, 'Unhandled browser error'));
	window.addEventListener('unhandledrejection', (event) =>
		reportException(event.reason, 'Unhandled promise rejection'),
	);
}
