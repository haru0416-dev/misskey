/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiDrive, handleHonoApiDriveFilesCheckExistence, handleHonoApiDriveFolders, handleHonoApiDriveFoldersCreate, handleHonoApiDriveFoldersDelete, handleHonoApiDriveFoldersFind, handleHonoApiDriveFoldersShow, handleHonoApiDriveFoldersUpdate } from '../drive.js';
import { handleHonoApiDriveFilesAttachedChatMessages, handleHonoApiDriveFilesAttachedNotes, handleHonoApiDriveFilesDelete, handleHonoApiDriveFilesFind, handleHonoApiDriveFilesFindByHash, handleHonoApiDriveFilesList, handleHonoApiDriveFilesMoveBulk, handleHonoApiDriveFilesShow, handleHonoApiDriveFilesUpdate, handleHonoApiDriveStream } from '../drive-files.js';
import { handleHonoApiDriveFilesCreate, handleHonoApiDriveFilesUploadFromUrl, readHonoApiMultipartRequest } from '../drive-file-upload.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { jsonResponse, emptyResponse, rawStatusResponse, jsonBody, tokenFromRequest, getRequestIp, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerDriveRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/drive/files', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesList(deps, auth.user, body));
		});
	});

	app.post('/drive/stream', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveStream(deps, auth.user, body));
		});
	});

	app.post('/drive/files/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const parsed = await readHonoApiMultipartRequest(c, deps.config);
			if (parsed.status === 'missing-file') return rawStatusResponse(c, 400);
			if (parsed.status === 'too-large') return rawStatusResponse(c, 413);

			const { file, cleanup, fields } = parsed;
			try {
				const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, fields));
				assertCredential(auth);
				assertProhibitMoved(auth.user);
				assertTokenPermission(auth, 'write:drive');
				await assertHonoApiRateLimitForUser(deps, 'drive/files/create', {
					duration: 60 * 60 * 1000,
					max: 120,
				}, auth.user);

				const ip = getRequestIp(c, deps.config);
				const headers = Object.fromEntries(c.req.raw.headers.entries());

				return jsonResponse(c, await handleHonoApiDriveFilesCreate(deps, auth.user, fields, file, ip, headers));
			} finally {
				cleanup();
			}
		});
	});

	app.post('/drive/files/upload-from-url', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:drive');
			await assertHonoApiRateLimitForUser(deps, 'drive/files/upload-from-url', {
				duration: 60 * 60 * 1000,
				max: 60,
			}, auth.user);

			const ip = getRequestIp(c, deps.config);
			const headers = Object.fromEntries(c.req.raw.headers.entries());

			handleHonoApiDriveFilesUploadFromUrl(deps, auth.user, body, ip, headers);
			return emptyResponse(c);
		});
	});

	app.post('/drive/files/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesShow(deps, auth.user, body));
		});
	});

	app.post('/drive/files/find', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesFind(deps, auth.user, body));
		});
	});

	app.post('/drive/files/find-by-hash', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesFindByHash(deps, auth.user, body));
		});
	});

	app.post('/drive/files/attached-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesAttachedNotes(deps, auth.user, body));
		});
	});

	app.post('/drive/files/attached-chat-messages', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesAttachedChatMessages(deps, auth.user, body));
		});
	});

	app.post('/drive/files/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			await handleHonoApiDriveFilesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/drive/files/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesUpdate(deps, auth.user, body));
		});
	});

	app.post('/drive/files/move-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			await handleHonoApiDriveFilesMoveBulk(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDrive(deps, auth.user));
		});
	});

	app.post('/drive/files/check-existence', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesCheckExistence(deps, auth.user, body));
		});
	});

	app.post('/drive/folders', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFolders(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');
			await assertHonoApiRateLimitForUser(deps, 'drive/folders/create', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user);

			return jsonResponse(c, await handleHonoApiDriveFoldersCreate(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			await handleHonoApiDriveFoldersDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/drive/folders/find', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersFind(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersShow(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersUpdate(deps, auth.user, body));
		});
	});
}
