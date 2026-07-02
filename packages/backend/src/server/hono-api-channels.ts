/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { fetchFavoriteChannelIdsFromDatabase, fetchFavoritedChannelIdsInDatabase } from '@/core/ChannelFavoriteStore.js';
import {
	createChannelFollowingInDatabase,
	deleteChannelFollowingFromDatabase,
	fetchFollowingChannelIdsInDatabase,
	listChannelFollowingsByFollowerIdFromDatabase,
} from '@/core/ChannelFollowingStore.js';
import {
	channelMutingExistsInDatabase,
	createChannelMutingInDatabase,
	deleteChannelMutingFromDatabase,
	fetchActiveMutedChannelIdsFromDatabase,
	fetchMutedChannelIdsInDatabase,
	updateChannelMutingExpirationInDatabase,
} from '@/core/ChannelMutingStore.js';
import {
	listChannelsByIdsFromDatabase,
	listChannelsBySearchFromDatabase,
	listOwnedChannelsFromDatabase,
	listRecentlyActiveChannelsFromDatabase,
	resolveChannelPagination,
	fetchChannelByIdFromDatabase,
} from '@/core/ChannelStore.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiMeta } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiChannelsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: HonoApiInternalEventPublisher;
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

const channelFollowParamDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId'],
} as const;

type ChannelFollowParams = {
	channelId: string;
};

const channelMuteCreateParamDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		expiresAt: {
			type: 'integer',
			nullable: true,
			description: 'A Unix Epoch timestamp that must lie in the future. `null` means an indefinite mute.',
		},
	},
	required: ['channelId'],
} as const;

type ChannelMuteCreateParams = {
	channelId: string;
	expiresAt?: number | null;
};

const channelMuteDeleteParamDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId'],
} as const;

type ChannelMuteDeleteParams = {
	channelId: string;
};

function channelFollowNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: 'c0031718-d573-4e85-928e-10039f1fbb68',
	});
}

function channelUnfollowNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: '19959ee9-0153-4c51-bbd9-a98c49dc59d6',
	});
}

function channelMuteCreateNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such Channel.',
		code: 'NO_SUCH_CHANNEL',
		id: '7174361e-d58f-31d6-2e7c-6fb830786a3f',
	});
}

function channelMuteCreateAlreadyMutingError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are already muting that user.',
		code: 'ALREADY_MUTING_CHANNEL',
		id: '5a251978-769a-da44-3e89-3931e43bb592',
	});
}

function channelMuteCreateExpiresAtIsPastError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Cannot set past date to "expiresAt".',
		code: 'EXPIRES_AT_IS_PAST',
		id: '42b32236-df2c-a45f-fdbf-def67268f749',
	});
}

function channelMuteDeleteNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such Channel.',
		code: 'NO_SUCH_CHANNEL',
		id: 'e7998769-6e94-d9c2-6b8f-94a527314aba',
	});
}

function channelMuteDeleteNotMutingError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are not muting that channel.',
		code: 'NOT_MUTING_CHANNEL',
		id: '14d55962-6ea8-d990-1333-d6bef78dc2ab',
	});
}

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

export async function handleHonoApiChannelsFollow(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelFollowParamDef, body) as ChannelFollowParams;
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw channelFollowNoSuchChannelError();
	}

	await createChannelFollowingInDatabase(deps.db, {
		id: genId(deps.config),
		followerId: me.id,
		followeeId: targetChannel.id,
	});
	deps.publishInternalEvent?.('followChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleHonoApiChannelsUnfollow(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelFollowParamDef, body) as ChannelFollowParams;
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw channelUnfollowNoSuchChannelError();
	}

	await deleteChannelFollowingFromDatabase(deps.db, me.id, targetChannel.id);
	deps.publishInternalEvent?.('unfollowChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleHonoApiChannelsMuteCreate(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelMuteCreateParamDef, body) as ChannelMuteCreateParams;
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw channelMuteCreateNoSuchChannelError();
	}

	const exists = await channelMutingExistsInDatabase(deps.db, me.id, targetChannel.id);
	if (exists) {
		throw channelMuteCreateAlreadyMutingError();
	}

	if (params.expiresAt && params.expiresAt <= Date.now()) {
		throw channelMuteCreateExpiresAtIsPastError();
	}

	const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;
	try {
		await createChannelMutingInDatabase(deps.db, {
			id: genId(deps.config),
			userId: me.id,
			channelId: targetChannel.id,
			expiresAt,
		});
	} catch (err) {
		if (!isDuplicateKeyValueDatabaseError(err)) throw err;
		await updateChannelMutingExpirationInDatabase(deps.db, me.id, targetChannel.id, expiresAt);
	}

	deps.publishInternalEvent?.('muteChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleHonoApiChannelsMuteDelete(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelMuteDeleteParamDef, body) as ChannelMuteDeleteParams;
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw channelMuteDeleteNoSuchChannelError();
	}

	const exists = await channelMutingExistsInDatabase(deps.db, me.id, targetChannel.id);
	if (!exists) {
		throw channelMuteDeleteNotMutingError();
	}

	await deleteChannelMutingFromDatabase(deps.db, me.id, targetChannel.id);
	deps.publishInternalEvent?.('unmuteChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleHonoApiChannelsMuteList(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	parseHonoApiParams(emptyParamDef, body);
	const channelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());
	if (channelIds.length === 0) return [];

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds)
		.then(channels => new Map(channels.map(channel => [channel.id, channel])));
	const channels = channelIds
		.map(id => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null)
		.sort((a, b) => a.id.localeCompare(b.id));

	return await packChannelsForHonoApi(deps, channels, me);
}
