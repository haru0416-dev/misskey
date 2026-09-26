/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	handleApiAdminDriveCleanRemoteFiles,
	handleApiAdminDriveCleanup,
	handleApiAdminDriveShowFile,
} from '../admin/admin-drive.js';
import { handleApiAdminMeta, handleApiAdminUpdateMeta } from '../meta/meta.js';
import { jsonResponse, emptyResponse, assertApiModerator, assertApiAdmin } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAdminRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/admin/meta',
		endpointHandler(deps, 'admin/meta', async ({ body, auth, c }) => jsonResponse(c, await handleApiAdminMeta(deps))),
	);

	app.post(
		'/admin/update-meta',
		endpointHandler(deps, 'admin/update-meta', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminUpdateMeta(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/clean-remote-files',
		endpointHandler(deps, 'admin/drive/clean-remote-files', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminDriveCleanRemoteFiles(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/cleanup',
		endpointHandler(deps, 'admin/drive/cleanup', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminDriveCleanup(deps, body);
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
