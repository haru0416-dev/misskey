/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import { handleApiIWebhooksCreate } from '../webhook/webhooks.js';
import { jsonResponse, jsonBody, tokenFromRequest, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAccountIRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/i/webhooks/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			const policies = await getApiRolePolicies(deps, auth.user);

			return jsonResponse(c, await handleApiIWebhooksCreate(deps, auth.user, policies.webhookLimit, body));
		});
	});
}
