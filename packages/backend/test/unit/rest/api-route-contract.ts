/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { assertApiRouteContract } from '@/server/rest/api-route-contract.js';
import { createApiShellApp } from '@/server/rest/shell.js';

describe('API route contract', () => {
	test('all API routes and endpoint metadata agree', () => {
		const app = createApiShellApp({} as never);
		expect(() => assertApiRouteContract(app)).not.toThrow();
	});
});
