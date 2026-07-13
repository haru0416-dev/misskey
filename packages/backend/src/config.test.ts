/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { validateTelemetryConfig } from '@/config.js';

describe('telemetry config validation', () => {
	test('rejects frontend collector headers because public meta exposes frontend config', () => {
		expect(() => validateTelemetryConfig({
			telemetryForFrontend: {
				endpoint: 'https://collector.example/v1/traces',
				headers: { Authorization: 'Bearer secret' },
			},
		})).toThrow(/telemetryForFrontend\.headers is not supported/);
	});

	test('rejects invalid sampling ratios at the load boundary', () => {
		expect(() => validateTelemetryConfig({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				tracesSampleRatio: 2,
			},
		})).toThrow(/tracesSampleRatio must be a finite number between 0 and 1/);
	});

	test('accepts separate private backend and public frontend settings', () => {
		expect(validateTelemetryConfig({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				headers: { Authorization: 'Bearer secret' },
			},
			telemetryForFrontend: {
				endpoint: 'https://collector.example/v1/traces',
				propagateTraceHeaderCorsUrls: ['https://misskey.example/api'],
			},
		})).toEqual({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				headers: { Authorization: 'Bearer secret' },
				serviceName: undefined,
				tracesSampleRatio: undefined,
				tracePropagationTargets: undefined,
				disabledInstrumentations: undefined,
			},
			telemetryForFrontend: {
				endpoint: 'https://collector.example/v1/traces',
				serviceName: undefined,
				tracesSampleRatio: undefined,
				propagateTraceHeaderCorsUrls: ['https://misskey.example/api'],
			},
		});
	});

	test('accepts safe backend propagation targets and known instrumentation names', () => {
		expect(validateTelemetryConfig({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				tracePropagationTargets: ['https://api.example.com', 'https://internal.example.com/v1/'],
				disabledInstrumentations: ['@opentelemetry/instrumentation-pg'],
			},
		}).telemetryForBackend).toMatchObject({
			tracePropagationTargets: ['https://api.example.com', 'https://internal.example.com/v1/'],
			disabledInstrumentations: ['@opentelemetry/instrumentation-pg'],
		});
	});

	test('rejects invalid propagation targets and unknown instrumentation names', () => {
		expect(() => validateTelemetryConfig({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				tracePropagationTargets: ['api.example.com'],
			},
		})).toThrow(/tracePropagationTargets\[0\] must be a valid absolute URL/);

		expect(() => validateTelemetryConfig({
			telemetryForBackend: {
				endpoint: 'http://localhost:4318/v1/traces',
				disabledInstrumentations: ['@opentelemetry/instrumentation-unknown'],
			},
		})).toThrow(/disabledInstrumentations\[0\] is not a supported instrumentation package name/);
	});
});
