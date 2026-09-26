/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiMuteDelete, handleApiRenoteMuteCreate, handleApiRenoteMuteDelete } from '../account/account-mutes.js';
import { emptyResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAuthSessionMutesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/mute/delete',
		endpointHandler(deps, 'mute/delete', async ({ body, auth, c }) => {
			await handleApiMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/renote-mute/create',
		endpointHandler(deps, 'renote-mute/create', async ({ body, auth, c }) => {
			await handleApiRenoteMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/renote-mute/delete',
		endpointHandler(deps, 'renote-mute/delete', async ({ body, auth, c }) => {
			await handleApiRenoteMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
