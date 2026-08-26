/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	assertCredential,
	assertProhibitMoved,
	assertTokenPermission,
	authenticateHonoApiToken,
} from '../auth/auth.js';
import {
	handleHonoApiDrive,
	handleHonoApiDriveFilesCheckExistence,
	handleHonoApiDriveFolders,
	handleHonoApiDriveFoldersCreate,
	handleHonoApiDriveFoldersDelete,
	handleHonoApiDriveFoldersFind,
	handleHonoApiDriveFoldersShow,
	handleHonoApiDriveFoldersUpdate,
} from '../drive/drive.js';
import {
	handleHonoApiDriveFilesAttachedChatMessages,
	handleHonoApiDriveFilesAttachedNotes,
	handleHonoApiDriveFilesDelete,
	handleHonoApiDriveFilesFind,
	handleHonoApiDriveFilesFindByHash,
	handleHonoApiDriveFilesList,
	handleHonoApiDriveFilesMoveBulk,
	handleHonoApiDriveFilesShow,
	handleHonoApiDriveFilesUpdate,
	handleHonoApiDriveStream,
} from '../drive/drive-files.js';
import {
	handleHonoApiDriveFilesCreate,
	handleHonoApiDriveFilesUploadFromUrl,
	readHonoApiMultipartRequest,
} from '../drive/drive-file-upload.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { invalidParamError, payloadTooLargeError } from '../error.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	getRequestIp,
	runApiEndpoint,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerDriveRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/drive/files',
		endpointHandler(deps, 'drive/files', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesList(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/stream',
		endpointHandler(deps, 'drive/stream', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveStream(deps, auth.user, body)),
		),
	);

	app.post('/drive/files/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const parsed = await readHonoApiMultipartRequest(c, deps.config);
			if (parsed.status === 'missing-file') throw invalidParamError({ param: 'file', reason: 'required' });
			if (parsed.status === 'too-large') throw payloadTooLargeError();

			const { file, cleanup, fields } = parsed;
			try {
				const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, fields));
				assertCredential(auth);
				assertProhibitMoved(auth.user);
				assertTokenPermission(auth, 'write:drive');
				await assertHonoApiRateLimitForUser(
					deps,
					'drive/files/create',
					{
						duration: 60 * 60 * 1000,
						max: 120,
					},
					auth.user,
				);

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
			await assertHonoApiRateLimitForUser(
				deps,
				'drive/files/upload-from-url',
				{
					duration: 60 * 60 * 1000,
					max: 60,
				},
				auth.user,
			);

			const ip = getRequestIp(c, deps.config);
			const headers = Object.fromEntries(c.req.raw.headers.entries());

			handleHonoApiDriveFilesUploadFromUrl(deps, auth.user, body, ip, headers);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/drive/files/show',
		endpointHandler(deps, 'drive/files/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/files/find',
		endpointHandler(deps, 'drive/files/find', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesFind(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/files/find-by-hash',
		endpointHandler(deps, 'drive/files/find-by-hash', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesFindByHash(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/files/attached-notes',
		endpointHandler(deps, 'drive/files/attached-notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesAttachedNotes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/files/attached-chat-messages',
		endpointHandler(deps, 'drive/files/attached-chat-messages', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesAttachedChatMessages(deps, auth.user, body)),
		),
	);

	app.post(
		'/drive/files/delete',
		endpointHandler(deps, 'drive/files/delete', async ({ body, auth, c }) => {
			await handleHonoApiDriveFilesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/drive/files/update',
		endpointHandler(deps, 'drive/files/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/drive/files/move-bulk',
		endpointHandler(deps, 'drive/files/move-bulk', async ({ body, auth, c }) => {
			await handleHonoApiDriveFilesMoveBulk(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/drive',
		endpointHandler(deps, 'drive', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDrive(deps, auth.user)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/files/check-existence',
		endpointHandler(deps, 'drive/files/check-existence', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFilesCheckExistence(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/folders',
		endpointHandler(deps, 'drive/folders', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFolders(deps, auth.user, body)),
		),
	);

	app.post(
		'/drive/folders/create',
		endpointHandler(deps, 'drive/folders/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFoldersCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/drive/folders/delete',
		endpointHandler(deps, 'drive/folders/delete', async ({ body, auth, c }) => {
			await handleHonoApiDriveFoldersDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/folders/find',
		endpointHandler(deps, 'drive/folders/find', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFoldersFind(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/drive/folders/show',
		endpointHandler(deps, 'drive/folders/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFoldersShow(deps, auth.user, body)),
		),
	);

	app.post(
		'/drive/folders/update',
		endpointHandler(deps, 'drive/folders/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiDriveFoldersUpdate(deps, auth.user, body)),
		),
	);
}
