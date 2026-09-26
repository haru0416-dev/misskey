/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as antennasContracts } from '@/server/api/metas/antennas.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAntennasCreate,
	handleApiAntennasDelete,
	handleApiAntennasList,
	handleApiAntennasNotes,
	handleApiAntennasRemoveNote,
	handleApiAntennasShow,
	handleApiAntennasUpdate,
} from '../antenna/antennas.js';

export const antennasEndpoints = implementEndpoints<ApiShellDependencies>()(antennasContracts, {
	'antennas/create': async ({ deps, input, me }) => await handleApiAntennasCreate(deps, me, input),
	'antennas/delete': async ({ deps, input, me }) => {
		await handleApiAntennasDelete(deps, me, input);
	},
	'antennas/list': async ({ deps, me }) => await handleApiAntennasList(deps, me),
	'antennas/notes': async ({ deps, input, me }) => await handleApiAntennasNotes(deps, me, input),
	'antennas/remove-note': async ({ deps, input, me }) => {
		await handleApiAntennasRemoveNote(deps, me, input);
	},
	'antennas/show': async ({ deps, input, me }) => await handleApiAntennasShow(deps, me, input),
	'antennas/update': async ({ deps, input, me }) => await handleApiAntennasUpdate(deps, me, input),
});
