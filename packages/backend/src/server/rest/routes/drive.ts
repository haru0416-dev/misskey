/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, authenticateApiToken } from '../auth/auth.js';
import { applyEndpointGuards } from '../endpoint-guards.js';
import { endpointMetas } from '@/server/api/endpoint-metas.js';
import { handleApiDriveFilesCreate, readApiMultipartRequest } from '../drive/drive-file-upload.js';
import { invalidParamError, payloadTooLargeError } from '../error.js';
import { jsonResponse, tokenFromRequest, getRequestIp, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

const driveFilesCreateMeta = endpointMetas['drive/files/create'].meta;

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
				// multipart の本文から token を読むため登録は手書きだが、検査は契約と同じく meta から組み立てる。
				await applyEndpointGuards(deps, 'drive/files/create', driveFilesCreateMeta, auth, () =>
					getRequestIp(c, deps.config),
				);
				assertCredential(auth);

				const ip = getRequestIp(c, deps.config);
				const headers = Object.fromEntries(c.req.raw.headers.entries());

				return jsonResponse(c, await handleApiDriveFilesCreate(deps, auth.user, fields, file, ip, headers));
			} finally {
				cleanup();
			}
		});
	});
}
