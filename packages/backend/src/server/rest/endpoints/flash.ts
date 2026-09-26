/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as flashContracts } from '@/server/api/metas/flash.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { handleApiFlashLike, handleApiFlashUnlike } from '../favorite/favorites.js';
import {
	handleApiFlashCreate,
	handleApiFlashDelete,
	handleApiFlashFeatured,
	handleApiFlashMy,
	handleApiFlashMyLikes,
	handleApiFlashSearch,
	handleApiFlashShow,
	handleApiFlashUpdate,
} from '../flash/flash.js';

export const flashEndpoints = implementEndpoints<ApiShellDependencies>()(flashContracts, {
	'flash/create': async ({ deps, input, me }) => await handleApiFlashCreate(deps, me, input),
	'flash/delete': async ({ deps, input, me }) => {
		await handleApiFlashDelete(deps, me, input);
	},
	'flash/featured': async ({ deps, input, me }) => await handleApiFlashFeatured(deps, me, input),
	'flash/like': async ({ deps, input, me }) => {
		await handleApiFlashLike(deps, me, input);
	},
	'flash/my': async ({ deps, input, me }) => await handleApiFlashMy(deps, me, input),
	'flash/my-likes': async ({ deps, input, me }) => await handleApiFlashMyLikes(deps, me, input),
	'flash/show': async ({ deps, input, me }) => await handleApiFlashShow(deps, me, input),
	'flash/unlike': async ({ deps, input, me }) => {
		await handleApiFlashUnlike(deps, me, input);
	},
	'flash/update': async ({ deps, input, me }) => {
		await handleApiFlashUpdate(deps, me, input);
	},
	'flash/search': async ({ deps, input, me }) => await handleApiFlashSearch(deps, me, input),
});
