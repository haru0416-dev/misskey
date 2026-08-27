/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertSecureCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiAdminEmojiAdd,
	handleApiAdminEmojiAddAliasesBulk,
	handleApiAdminEmojiCopy,
	handleApiAdminEmojiDelete,
	handleApiAdminEmojiDeleteBulk,
	handleApiAdminEmojiImportZip,
	handleApiAdminEmojiList,
	handleApiAdminEmojiListRemote,
	handleApiAdminEmojiRemoveAliasesBulk,
	handleApiAdminEmojiSetAliasesBulk,
	handleApiAdminEmojiSetCategoryBulk,
	handleApiAdminEmojiSetLicenseBulk,
	handleApiAdminEmojiUpdate,
	handleApiEmoji,
	handleApiEmojis,
	handleApiV2AdminEmojiList,
} from '../emoji/emojis.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertApiCanManageCustomEmojis,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerEmojisRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.get(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/emoji/list',
		endpointHandler(deps, 'admin/emoji/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminEmojiList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/v2/admin/emoji/list',
		endpointHandler(deps, 'v2/admin/emoji/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiV2AdminEmojiList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/emoji/list-remote',
		endpointHandler(deps, 'admin/emoji/list-remote', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminEmojiListRemote(deps, body)),
		),
	);

	app.post(
		'/admin/emoji/add',
		endpointHandler(deps, 'admin/emoji/add', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminEmojiAdd(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/emoji/copy',
		endpointHandler(deps, 'admin/emoji/copy', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminEmojiCopy(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/emoji/add-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/add-aliases-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiAddAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/remove-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/remove-aliases-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiRemoveAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-aliases-bulk',
		endpointHandler(deps, 'admin/emoji/set-aliases-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiSetAliasesBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-category-bulk',
		endpointHandler(deps, 'admin/emoji/set-category-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiSetCategoryBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/set-license-bulk',
		endpointHandler(deps, 'admin/emoji/set-license-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiSetLicenseBulk(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/delete',
		endpointHandler(deps, 'admin/emoji/delete', async ({ body, auth, c }) => {
			await handleApiAdminEmojiDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/delete-bulk',
		endpointHandler(deps, 'admin/emoji/delete-bulk', async ({ body, auth, c }) => {
			await handleApiAdminEmojiDeleteBulk(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/import-zip',
		endpointHandler(deps, 'admin/emoji/import-zip', async ({ body, auth, c }) => {
			await handleApiAdminEmojiImportZip(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/emoji/update',
		endpointHandler(deps, 'admin/emoji/update', async ({ body, auth, c }) => {
			await handleApiAdminEmojiUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
