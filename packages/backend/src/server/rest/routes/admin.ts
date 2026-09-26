/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiAdminDriveShowFile } from '../admin/admin-drive.js';
import { handleApiAdminUpdateMeta } from '../meta/meta.js';
import { jsonResponse, emptyResponse, assertApiAdmin } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAdminRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/admin/update-meta',
		endpointHandler(deps, 'admin/update-meta', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminUpdateMeta(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/drive/show-file',
		endpointHandler(deps, 'admin/drive/show-file', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminDriveShowFile(deps, auth.user, body)),
		),
	);
}
