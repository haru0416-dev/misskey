/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as clipsContracts } from '@/server/api/metas/clips.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiClipsAddNote,
	handleApiClipsCreate,
	handleApiClipsDelete,
	handleApiClipsList,
	handleApiClipsMyFavorites,
	handleApiClipsNotes,
	handleApiClipsRemoveNote,
	handleApiClipsShow,
	handleApiClipsUpdate,
} from '../clip/clips.js';
import { handleApiClipsFavorite, handleApiClipsUnfavorite } from '../favorite/favorites.js';

export const clipsEndpoints = implementEndpoints<ApiShellDependencies>()(clipsContracts, {
	'clips/add-note': async ({ deps, errors, input, me }) => {
		await handleApiClipsAddNote(deps, me, input, errors);
	},
	'clips/create': async ({ deps, errors, input, me }) => await handleApiClipsCreate(deps, me, input, errors),
	'clips/delete': async ({ deps, errors, input, me }) => {
		await handleApiClipsDelete(deps, me, input, errors);
	},
	'clips/favorite': async ({ deps, input, me }) => {
		await handleApiClipsFavorite(deps, me, input);
	},
	'clips/list': async ({ deps, input, me }) => await handleApiClipsList(deps, me, input),
	'clips/my-favorites': async ({ deps, me }) => await handleApiClipsMyFavorites(deps, me),
	'clips/notes': async ({ deps, errors, input, me }) => await handleApiClipsNotes(deps, me, input, errors),
	'clips/remove-note': async ({ deps, errors, input, me }) => {
		await handleApiClipsRemoveNote(deps, me, input, errors);
	},
	'clips/show': async ({ deps, errors, input, me }) => await handleApiClipsShow(deps, me, input, errors),
	'clips/unfavorite': async ({ deps, input, me }) => {
		await handleApiClipsUnfavorite(deps, me, input);
	},
	'clips/update': async ({ deps, errors, input, me }) => await handleApiClipsUpdate(deps, me, input, errors),
});
