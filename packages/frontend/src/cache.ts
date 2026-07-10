/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { QueryBackedCache } from '@/query/cache.js';
import { queryKeys } from '@/query/keys.js';

const accountId = $i?.id ?? null;
const staleTime = 1000 * 60 * 30;

export const clipsCache = new QueryBackedCache<Misskey.entities.Clip[]>(
	queryKeys.endpoint(accountId, 'clips/list', { limit: 30 }),
	(signal) => misskeyApi('clips/list', { limit: 30 }, undefined, signal),
	staleTime,
);
export const rolesCache = new QueryBackedCache(
	queryKeys.endpoint(accountId, 'admin/roles/list', { limit: 30 }),
	(signal) => misskeyApi('admin/roles/list', { limit: 30 }, undefined, signal),
	staleTime,
);
export const userListsCache = new QueryBackedCache<Misskey.entities.UserList[]>(
	queryKeys.endpoint(accountId, 'users/lists/list', {}),
	(signal) => misskeyApi('users/lists/list', {}, undefined, signal),
	staleTime,
);
export const antennasCache = new QueryBackedCache<Misskey.entities.Antenna[]>(
	queryKeys.endpoint(accountId, 'antennas/list', { limit: 30 }),
	(signal) => misskeyApi('antennas/list', { limit: 30 }, undefined, signal),
	staleTime,
);
export const favoritedChannelsCache = new QueryBackedCache<Misskey.entities.Channel[]>(
	queryKeys.endpoint(accountId, 'channels/my-favorites', { limit: 100 }),
	(signal) => misskeyApi('channels/my-favorites', { limit: 100 }, undefined, signal),
	staleTime,
);
