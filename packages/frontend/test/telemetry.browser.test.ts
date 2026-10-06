/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createFetchTelemetryUrlPatterns, redactTelemetryUrl } from '@/utility/telemetry-url.js';

describe('frontend telemetry privacy', () => {
	test('instruments only the same-instance API and explicitly configured API URLs', () => {
		const patterns = createFetchTelemetryUrlPatterns('https://misskey.example/api', [
			'https://api.example.test/otel-api',
		]);

		expect(patterns.allowed.test('https://misskey.example/api/notes/create?token=secret')).toBe(true);
		expect(patterns.allowed.test('https://api.example.test/otel-api/users')).toBe(true);
		expect(patterns.allowed.test('https://misskey.example/files/private')).toBe(false);
		expect(patterns.allowed.test('https://third-party.example/api')).toBe(false);
		expect(patterns.ignored.test('https://misskey.example/files/private')).toBe(true);
	});

	test('removes query parameters and fragments from span URL attributes', () => {
		expect(redactTelemetryUrl('https://misskey.example/api/notes?token=secret#fragment')).toBe(
			'https://misskey.example/api/notes',
		);
	});
});
