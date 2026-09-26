/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiIGalleryLikes, handleApiIGalleryPosts } from '../gallery/gallery.js';
import { jsonResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerFollowingGalleryFlashRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/i/gallery/posts',
		endpointHandler(deps, 'i/gallery/posts', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIGalleryPosts(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/i/gallery/likes',
		endpointHandler(deps, 'i/gallery/likes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiIGalleryLikes(deps, auth.user, body)),
		),
	);
}
