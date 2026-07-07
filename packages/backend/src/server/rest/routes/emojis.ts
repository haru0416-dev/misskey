/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiAdminEmojiAdd, handleHonoApiAdminEmojiAddAliasesBulk, handleHonoApiAdminEmojiCopy, handleHonoApiAdminEmojiDelete, handleHonoApiAdminEmojiDeleteBulk, handleHonoApiAdminEmojiImportZip, handleHonoApiAdminEmojiList, handleHonoApiAdminEmojiListRemote, handleHonoApiAdminEmojiRemoveAliasesBulk, handleHonoApiAdminEmojiSetAliasesBulk, handleHonoApiAdminEmojiSetCategoryBulk, handleHonoApiAdminEmojiSetLicenseBulk, handleHonoApiAdminEmojiUpdate, handleHonoApiEmoji, handleHonoApiEmojis, handleHonoApiV2AdminEmojiList } from '../emojis.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint, assertHonoApiCanManageCustomEmojis } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerEmojisRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.get('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/admin/emoji/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiList(deps, body));
		});
	});

	app.post('/v2/admin/emoji/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiV2AdminEmojiList(deps, body));
		});
	});

	app.post('/admin/emoji/list-remote', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiListRemote(deps, body));
		});
	});

	app.post('/admin/emoji/add', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiAdd(deps, auth.user, body));
		});
	});

	app.post('/admin/emoji/copy', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiCopy(deps, auth.user, body));
		});
	});

	app.post('/admin/emoji/add-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiAddAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/remove-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiRemoveAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-category-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetCategoryBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-license-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetLicenseBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/delete-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiDeleteBulk(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/import-zip', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiImportZip(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});
}
