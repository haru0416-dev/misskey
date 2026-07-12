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
			},
			telemetryForFrontend: {
				endpoint: 'https://collector.example/v1/traces',
				serviceName: undefined,
				tracesSampleRatio: undefined,
				propagateTraceHeaderCorsUrls: ['https://misskey.example/api'],
			},
		});
	});
});
