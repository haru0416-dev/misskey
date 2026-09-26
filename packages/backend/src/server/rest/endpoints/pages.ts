/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as pagesContracts } from '@/server/api/metas/pages.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { handleApiPagesLike, handleApiPagesUnlike } from '../favorite/favorites.js';
import {
	handleApiPagesCreate,
	handleApiPagesDelete,
	handleApiPagesFeatured,
	handleApiPagesShow,
	handleApiPagesUpdate,
} from '../page/pages.js';

export const pagesEndpoints = implementEndpoints<ApiShellDependencies>()(pagesContracts, {
	'pages/create': async ({ deps, input, me }) => await handleApiPagesCreate(deps, me, input),
	'pages/delete': async ({ deps, input, me }) => {
		await handleApiPagesDelete(deps, me, input);
	},
	'pages/featured': async ({ deps, me }) => await handleApiPagesFeatured(deps, me),
	'pages/like': async ({ deps, input, me }) => {
		await handleApiPagesLike(deps, me, input);
	},
	'pages/show': async ({ deps, input, me }) => await handleApiPagesShow(deps, me, input),
	'pages/unlike': async ({ deps, input, me }) => {
		await handleApiPagesUnlike(deps, me, input);
	},
	'pages/update': async ({ deps, input, me }) => {
		await handleApiPagesUpdate(deps, me, input);
	},
});
