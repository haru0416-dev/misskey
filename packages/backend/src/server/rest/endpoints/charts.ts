/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as chartsContracts } from '@/server/api/metas/charts.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiChartsActiveUsers,
	handleApiChartsApRequest,
	handleApiChartsDrive,
	handleApiChartsFederation,
	handleApiChartsInstance,
	handleApiChartsNotes,
	handleApiChartsUserDrive,
	handleApiChartsUserFollowing,
	handleApiChartsUserNotes,
	handleApiChartsUserPv,
	handleApiChartsUserReactions,
	handleApiChartsUsers,
} from '../chart/charts.js';

export const chartsEndpoints = implementEndpoints<ApiShellDependencies>()(chartsContracts, {
	'charts/active-users': async ({ deps, input }) => await handleApiChartsActiveUsers(deps, input),
	'charts/ap-request': async ({ deps, input }) => await handleApiChartsApRequest(deps, input),
	'charts/drive': async ({ deps, input }) => await handleApiChartsDrive(deps, input),
	'charts/federation': async ({ deps, input }) => await handleApiChartsFederation(deps, input),
	'charts/instance': async ({ deps, input }) => await handleApiChartsInstance(deps, input),
	'charts/notes': async ({ deps, input }) => await handleApiChartsNotes(deps, input),
	'charts/user/drive': async ({ deps, input }) => await handleApiChartsUserDrive(deps, input),
	'charts/user/following': async ({ deps, input }) => await handleApiChartsUserFollowing(deps, input),
	'charts/user/notes': async ({ deps, input }) => await handleApiChartsUserNotes(deps, input),
	'charts/user/pv': async ({ deps, input }) => await handleApiChartsUserPv(deps, input),
	'charts/user/reactions': async ({ deps, input }) => await handleApiChartsUserReactions(deps, input),
	'charts/users': async ({ deps, input }) => await handleApiChartsUsers(deps, input),
});
