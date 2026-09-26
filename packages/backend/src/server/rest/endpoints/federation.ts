/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as federationContracts } from '@/server/api/metas/federation.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { handleApiFederationUpdateRemoteUser } from '../activitypub/ap-person.js';
import {
	handleApiFederationFollowers,
	handleApiFederationFollowing,
	handleApiFederationInstances,
	handleApiFederationShowInstance,
	handleApiFederationUsers,
} from '../activitypub/federation.js';

export const federationEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(federationContracts, [
		'federation/followers',
		'federation/following',
		'federation/instances',
		'federation/show-instance',
		'federation/update-remote-user',
		'federation/users',
	]),
	{
		'federation/followers': async ({ deps, input }) => await handleApiFederationFollowers(deps, input),
		'federation/following': async ({ deps, input }) => await handleApiFederationFollowing(deps, input),
		'federation/instances': async ({ deps, input, me }) => await handleApiFederationInstances(deps, me, input),
		'federation/show-instance': async ({ deps, input, me }) => await handleApiFederationShowInstance(deps, me, input),
		'federation/update-remote-user': async ({ deps, input }) => {
			await handleApiFederationUpdateRemoteUser(deps, input);
		},
		'federation/users': async ({ deps, input, me }) => await handleApiFederationUsers(deps, me, input),
	},
);
