/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as channelsContracts } from '@/server/api/metas/channels.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiChannelsCreate,
	handleApiChannelsFeatured,
	handleApiChannelsFollow,
	handleApiChannelsFollowed,
	handleApiChannelsMuteCreate,
	handleApiChannelsMuteDelete,
	handleApiChannelsMuteList,
	handleApiChannelsMyFavorites,
	handleApiChannelsOwned,
	handleApiChannelsSearch,
	handleApiChannelsShow,
	handleApiChannelsUnfollow,
	handleApiChannelsUpdate,
} from '../channel/channels.js';
import { handleApiChannelsFavorite, handleApiChannelsUnfavorite } from '../favorite/favorites.js';

export const channelsEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(channelsContracts, [
		'channels/create',
		'channels/favorite',
		'channels/featured',
		'channels/follow',
		'channels/followed',
		'channels/mute/create',
		'channels/mute/delete',
		'channels/mute/list',
		'channels/my-favorites',
		'channels/owned',
		'channels/search',
		'channels/show',
		'channels/unfavorite',
		'channels/unfollow',
		'channels/update',
	]),
	{
		'channels/create': async ({ deps, errors, input, me }) => await handleApiChannelsCreate(deps, me, input, errors),
		'channels/favorite': async ({ deps, input, me }) => {
			await handleApiChannelsFavorite(deps, me, input);
		},
		'channels/featured': async ({ deps, me }) => await handleApiChannelsFeatured(deps, me),
		'channels/follow': async ({ deps, errors, input, me }) => {
			await handleApiChannelsFollow(deps, me, input, errors);
		},
		'channels/followed': async ({ deps, input, me }) => await handleApiChannelsFollowed(deps, me, input),
		'channels/my-favorites': async ({ deps, me }) => await handleApiChannelsMyFavorites(deps, me),
		'channels/owned': async ({ deps, input, me }) => await handleApiChannelsOwned(deps, me, input),
		'channels/search': async ({ deps, input, me }) => await handleApiChannelsSearch(deps, me, input),
		'channels/show': async ({ deps, errors, input, me }) => await handleApiChannelsShow(deps, me, input, errors),
		'channels/unfavorite': async ({ deps, input, me }) => {
			await handleApiChannelsUnfavorite(deps, me, input);
		},
		'channels/unfollow': async ({ deps, errors, input, me }) => {
			await handleApiChannelsUnfollow(deps, me, input, errors);
		},
		'channels/update': async ({ deps, errors, input, me }) => await handleApiChannelsUpdate(deps, me, input, errors),
		'channels/mute/create': async ({ deps, errors, input, me }) => {
			await handleApiChannelsMuteCreate(deps, me, input, errors);
		},
		'channels/mute/delete': async ({ deps, errors, input, me }) => {
			await handleApiChannelsMuteDelete(deps, me, input, errors);
		},
		'channels/mute/list': async ({ deps, me }) => await handleApiChannelsMuteList(deps, me),
	},
);
