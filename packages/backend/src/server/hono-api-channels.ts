/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { fetchFavoriteChannelIdsFromDatabase, fetchFavoritedChannelIdsInDatabase } from '@/core/ChannelFavoriteStore.js';
import { fetchFollowingChannelIdsInDatabase, listChannelFollowingsByFollowerIdFromDatabase } from '@/core/ChannelFollowingStore.js';
import { fetchMutedChannelIdsInDatabase } from '@/core/ChannelMutingStore.js';
import {
	listChannelsByIdsFromDatabase,
	listChannelsBySearchFromDatabase,
	listOwnedChannelsFromDatabase,
	listRecentlyActiveChannelsFromDatabase,
	resolveChannelPagination,
} from '@/core/ChannelStore.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiMeta } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser } from '@/models/User.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiChannelsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

type HonoApiPackedChannel = Packed<'Channel'>;

const channelsListParamDef = {
	type: 'object',
	properties: {
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
	},
	required: [],
} as const;

type ChannelsListParams = {
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	limit: number;
};

const channelsSearchParamDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		type: { type: 'string', enum: ['nameAndDescription', 'nameOnly'], default: 'nameAndDescription' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
	},
	required: ['query'],
} as const;

type ChannelsSearchParams = ChannelsListParams & {
	query: string;
	type: 'nameAndDescription' | 'nameOnly';
};

const emptyParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

type ChannelPackHint = {
	bannerFiles: Map<MiDriveFile['id'], MiDriveFile>;
	followings: Set<MiChannel['id']>;
	favorites: Set<MiChannel['id']>;
	muting: Set<MiChannel['id']>;
};

async function buildChannelPackHint(
	deps: HonoApiChannelsDependencies,
	channels: MiChannel[],
	me: MiLocalUser | null,
): Promise<ChannelPackHint> {
	const channelIds = channels.map(channel => channel.id);
	const [bannerFiles, followings, favorites, muting] = await Promise.all([
		listDriveFilesByIdsFromDatabase(deps.db, channels.map(channel => channel.bannerId).filter(id => id != null))
			.then(files => new Map(files.map(file => [file.id, file]))),
		me == null ? Promise.resolve(new Set<MiChannel['id']>()) : fetchFollowingChannelIdsInDatabase(deps.db, me.id, channelIds),
		me == null ? Promise.resolve(new Set<MiChannel['id']>()) : fetchFavoritedChannelIdsInDatabase(deps.db, me.id, channelIds),
		me == null ? Promise.resolve(new Set<MiChannel['id']>()) : fetchMutedChannelIdsInDatabase(deps.db, me.id, channelIds),
	]);

	return {
		bannerFiles,
		followings,
		favorites,
		muting,
	};
}

function packChannelForHonoApi(
	deps: HonoApiChannelsDependencies,
	channel: MiChannel,
	me: MiLocalUser | null,
	hint: ChannelPackHint,
): HonoApiPackedChannel {
	const bannerFile = channel.bannerId == null ? null : hint.bannerFiles.get(channel.bannerId) ?? null;

	return {
		id: channel.id,
		createdAt: parseId(deps.config, channel.id).date.toISOString(),
		lastNotedAt: channel.lastNotedAt ? channel.lastNotedAt.toISOString() : null,
		name: channel.name,
		description: channel.description,
		userId: channel.userId,
		bannerUrl: bannerFile ? getDriveFilePublicUrl(bannerFile, deps) : null,
		bannerId: channel.bannerId,
		pinnedNoteIds: channel.pinnedNoteIds,
		color: channel.color,
		isArchived: channel.isArchived,
		usersCount: channel.usersCount,
		notesCount: channel.notesCount,
		isSensitive: channel.isSensitive,
		allowRenoteToExternal: channel.allowRenoteToExternal,
		...(me == null ? {} : {
			isFollowing: hint.followings.has(channel.id),
			isFavorited: hint.favorites.has(channel.id),
			isMuting: hint.muting.has(channel.id),
			hasUnreadNote: false,
		}),
	};
}

async function packChannelsForHonoApi(
	deps: HonoApiChannelsDependencies,
	channels: MiChannel[],
	me: MiLocalUser | null,
): Promise<HonoApiPackedChannel[]> {
	const hint = await buildChannelPackHint(deps, channels, me);
	return channels.map(channel => packChannelForHonoApi(deps, channel, me, hint));
}

export async function handleHonoApiChannelsFeatured(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	parseHonoApiParams(emptyParamDef, body);
	const channels = await listRecentlyActiveChannelsFromDatabase(deps.db, 10);
	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsSearch(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	const params = parseHonoApiParams(channelsSearchParamDef, body) as ChannelsSearchParams;
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(deps.config, params.sinceDate) : null);
	const untilId = params.untilId ?? (params.untilDate ? genId(deps.config, params.untilDate) : null);
	const channels = await listChannelsBySearchFromDatabase(deps.db, {
		query: sqlLikeEscape(params.query),
		type: params.type,
		limit: params.limit,
		sinceId,
		untilId,
		order: sinceId != null && untilId == null ? 'asc' : 'desc',
	});

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsOwned(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	const params = parseHonoApiParams(channelsListParamDef, body) as ChannelsListParams;
	const channels = await listOwnedChannelsFromDatabase(deps.db, me.id, {
		...resolveChannelPagination({
			gen: (time?: number) => genId(deps.config, time),
		}, params),
		limit: params.limit,
	});

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsFollowed(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	const params = parseHonoApiParams(channelsListParamDef, body) as ChannelsListParams;
	const followings = await listChannelFollowingsByFollowerIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		...resolveChannelPagination({
			gen: (time?: number) => genId(deps.config, time),
		}, params),
	});
	const channelIds = followings.map(following => following.followeeId);
	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds)
		.then(channels => new Map(channels.map(channel => [channel.id, channel])));
	const channels = channelIds
		.map(id => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsMyFavorites(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	parseHonoApiParams(emptyParamDef, body);
	const channelIds = await fetchFavoriteChannelIdsFromDatabase(deps.db, me.id);
	if (channelIds.length === 0) return [];

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds)
		.then(channels => new Map(channels.map(channel => [channel.id, channel])));
	const channels = channelIds
		.map(id => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForHonoApi(deps, channels, me);
}
