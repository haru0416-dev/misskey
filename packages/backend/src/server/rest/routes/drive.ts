/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiDriveFilesCreate,
	handleApiDriveFilesUploadFromUrl,
	readApiMultipartRequest,
} from '../drive/drive-file-upload.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
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

export function registerDriveRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/drive/files/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const parsed = await readApiMultipartRequest(c, deps.config);
			if (parsed.status === 'missing-file') {
				throw invalidParamError({ param: 'file', reason: 'required' });
			}
			if (parsed.status === 'too-large') {
				throw payloadTooLargeError();
			}

			const { file, cleanup, fields } = parsed;
			try {
				const auth = await authenticateApiToken(deps, tokenFromRequest(c, fields));
				assertCredential(auth);
				assertProhibitMoved(auth.user);
				assertTokenPermission(auth, 'write:drive');
				await assertApiRateLimitForUser(
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

				return jsonResponse(c, await handleApiDriveFilesCreate(deps, auth.user, fields, file, ip, headers));
			} finally {
				cleanup();
			}
		});
	});

	app.post('/drive/files/upload-from-url', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:drive');
			await assertApiRateLimitForUser(
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

			handleApiDriveFilesUploadFromUrl(deps, auth.user, body, ip, headers);
			return emptyResponse(c);
		});
	});
}
