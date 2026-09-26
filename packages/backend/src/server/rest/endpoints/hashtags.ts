/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as hashtagsContracts } from '@/server/api/metas/hashtags.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiHashtagsList,
	handleApiHashtagsSearch,
	handleApiHashtagsShow,
	handleApiHashtagsTrend,
	handleApiHashtagsUsers,
} from '../hashtag/hashtags.js';

export const hashtagsEndpoints = implementEndpoints<ApiShellDependencies>()(hashtagsContracts, {
	'hashtags/list': async ({ deps, input }) => await handleApiHashtagsList(deps, input),
	'hashtags/search': async ({ deps, input }) => await handleApiHashtagsSearch(deps, input),
	'hashtags/show': async ({ deps, errors, input }) => await handleApiHashtagsShow(deps, input, errors),
	'hashtags/users': async ({ deps, input, me }) => await handleApiHashtagsUsers(deps, me, input),
	'hashtags/trend': async ({ deps, input }) => await handleApiHashtagsTrend(deps, input),
});
