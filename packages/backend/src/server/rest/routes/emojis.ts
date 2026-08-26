/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth/auth.js';
import {
	handleHonoApiAdminEmojiAdd,
	handleHonoApiAdminEmojiAddAliasesBulk,
	handleHonoApiAdminEmojiCopy,
	handleHonoApiAdminEmojiDelete,
	handleHonoApiAdminEmojiDeleteBulk,
	handleHonoApiAdminEmojiImportZip,
	handleHonoApiAdminEmojiList,
	handleHonoApiAdminEmojiListRemote,
	handleHonoApiAdminEmojiRemoveAliasesBulk,
	handleHonoApiAdminEmojiSetAliasesBulk,
	handleHonoApiAdminEmojiSetCategoryBulk,
	handleHonoApiAdminEmojiSetLicenseBulk,
	handleHonoApiAdminEmojiUpdate,
	handleHonoApiEmoji,
	handleHonoApiEmojis,
	handleHonoApiV2AdminEmojiList,
} from '../emoji/emojis.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertHonoApiCanManageCustomEmojis,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerEmojisRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.get(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/emoji/list',
		endpointHandler(deps, 'admin/emoji/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminEmojiList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/v2/admin/emoji/list',
		endpointHandler(deps, 'v2/admin/emoji/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiV2AdminEmojiList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/emoji/list-remote',
		endpointHandler(deps, 'admin/emoji/list-remote', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminEmojiListRemote(deps, body)),
		),
	);

	app.post(
		'/admin/emoji/add',
		endpointHandler(deps, 'admin/emoji/add', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminEmojiAdd(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/emoji/copy',
		endpointHandler(deps, 'admin/emoji/copy', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminEmojiCopy(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/emoji/add-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/add-aliases-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiAddAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/remove-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/remove-aliases-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiRemoveAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/set-aliases-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiSetAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-category-bulk',
		endpointHandler(deps, 'admin/emoji/set-category-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiSetCategoryBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-license-bulk',
		endpointHandler(deps, 'admin/emoji/set-license-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiSetLicenseBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/delete',
		endpointHandler(deps, 'admin/emoji/delete', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/delete-bulk',
		endpointHandler(deps, 'admin/emoji/delete-bulk', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiDeleteBulk(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/import-zip',
		endpointHandler(deps, 'admin/emoji/import-zip', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiImportZip(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/update',
		endpointHandler(deps, 'admin/emoji/update', async ({ body, auth, c }) => {
			await handleHonoApiAdminEmojiUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
