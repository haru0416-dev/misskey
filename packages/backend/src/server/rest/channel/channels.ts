/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as channelsContracts } from '@/server/api/metas/channels.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	fetchFavoritedChannelIdsByUserIdAndChannelIdsFromDatabase,
	listFavoritedChannelIdsByUserIdFromDatabase,
} from '@/core/channel/ChannelFavoriteStore.js';
import {
	createChannelFollowingInDatabase,
	deleteChannelFollowingFromDatabase,
	fetchFollowedChannelIdsByUserIdAndChannelIdsFromDatabase,
	listChannelFollowingsByFollowerIdFromDatabase,
} from '@/core/channel/ChannelFollowingStore.js';
import {
	channelMutingExistsInDatabase,
	createChannelMutingInDatabase,
	deleteChannelMutingFromDatabase,
	listActiveMutedChannelIdsByUserIdFromDatabase,
	fetchMutedChannelIdsByUserIdAndChannelIdsFromDatabase,
	updateChannelMutingExpirationInDatabase,
} from '@/core/channel/ChannelMutingStore.js';
import {
	createChannelInDatabase,
	listChannelsByIdsFromDatabase,
	listChannelsBySearchFromDatabase,
	listOwnedChannelsFromDatabase,
	listRecentlyActiveChannelsFromDatabase,
	fetchChannelByIdFromDatabase,
	updateChannelInDatabase,
} from '@/core/channel/ChannelStore.js';
import { getDriveFilePublicUrl } from '@/core/drive/DriveFilePublicUrl.js';
import {
	fetchDriveFileByIdAndUserIdFromDatabase,
	listDriveFilesByIdsFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import { listChannelTimelineNotesFromDatabase, listNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ApiInternalEventPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { packNoteManyForApi } from '../note/note.js';
import type { ApiNoteDependencies } from '../note/note.js';
import { isApiModerator } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { resolveApiDateIdBounds } from '../date-id-pagination.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type ApiChannelsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: ApiInternalEventPublisher;
};

type ApiPackedChannel = Packed<'Channel'>;

export const channelsListParamDef = z.object({
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(5),
});

export const channelsSearchParamDef = z.object({
	query: z.string(),
	type: z.enum(['nameAndDescription', 'nameOnly']).optional().default('nameAndDescription'),
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(5),
});

export const emptyParamDef = z.object({});

export const channelCreateParamDef = z.object({
	name: z.string().min(1).max(128),
	description: z.string().max(2048).nullable().optional(),
	bannerId: misskeyId().nullable().optional(),
	color: z.string().min(1).max(16).optional(),
	isSensitive: z.boolean().nullable().optional(),
	allowRenoteToExternal: z.boolean().nullable().optional(),
});

export const channelUpdateParamDef = z.object({
	channelId: misskeyId(),
	name: z.string().min(1).max(128).optional(),
	description: z.string().max(2048).nullable().optional(),
	bannerId: misskeyId().nullable().optional(),
	isArchived: z.boolean().nullable().optional(),
	pinnedNoteIds: z.array(misskeyId()).optional(),
	color: z.string().min(1).max(16).optional(),
	isSensitive: z.boolean().nullable().optional(),
	allowRenoteToExternal: z.boolean().nullable().optional(),
});

export const channelFollowParamDef = z.object({
	channelId: misskeyId(),
});

export const channelMuteCreateParamDef = z.object({
	channelId: misskeyId(),
	expiresAt: z.int().nullable().optional(),
});

export const channelMuteDeleteParamDef = z.object({
	channelId: misskeyId(),
});

export const channelShowParamDef = z.object({
	channelId: misskeyId(),
});

export const channelTimelineParamDef = z.object({
	channelId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

function channelsTimelineNoSuchChannelError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: '4d0eeeba-a02c-4c3c-9966-ef60d38d2e7f',
	});
}

type ChannelPackHint = {
	bannerFiles: Map<MiDriveFile['id'], MiDriveFile>;
	followings: Set<MiChannel['id']>;
	favorites: Set<MiChannel['id']>;
	muting: Set<MiChannel['id']>;
};

async function buildChannelPackHint(
	deps: ApiChannelsDependencies,
	channels: MiChannel[],
	me: MiLocalUser | null,
): Promise<ChannelPackHint> {
	const channelIds = channels.map((channel) => channel.id);
	const [bannerFiles, followings, favorites, muting] = await Promise.all([
		listDriveFilesByIdsFromDatabase(
			deps.db,
			channels.map((channel) => channel.bannerId).filter((id) => id != null),
		).then((files) => new Map(files.map((file) => [file.id, file]))),
		me == null
			? Promise.resolve(new Set<MiChannel['id']>())
			: fetchFollowedChannelIdsByUserIdAndChannelIdsFromDatabase(deps.db, me.id, channelIds),
		me == null
			? Promise.resolve(new Set<MiChannel['id']>())
			: fetchFavoritedChannelIdsByUserIdAndChannelIdsFromDatabase(deps.db, me.id, channelIds),
		me == null
			? Promise.resolve(new Set<MiChannel['id']>())
			: fetchMutedChannelIdsByUserIdAndChannelIdsFromDatabase(deps.db, me.id, channelIds),
	]);

	return {
		bannerFiles,
		followings,
		favorites,
		muting,
	};
}

function packChannelForApi(
	deps: ApiChannelsDependencies,
	channel: MiChannel,
	me: MiLocalUser | null,
	hint: ChannelPackHint,
): ApiPackedChannel {
	const bannerFile = channel.bannerId == null ? null : (hint.bannerFiles.get(channel.bannerId) ?? null);

	return {
		id: channel.id,
		createdAt: parseId(channel.id).date.toISOString(),
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
		...(me == null
			? {}
			: {
					isFollowing: hint.followings.has(channel.id),
					isFavorited: hint.favorites.has(channel.id),
					isMuting: hint.muting.has(channel.id),
					hasUnreadNote: false,
				}),
	};
}

async function packChannelsForApi(
	deps: ApiChannelsDependencies,
	channels: MiChannel[],
	me: MiLocalUser | null,
): Promise<ApiPackedChannel[]> {
	const hint = await buildChannelPackHint(deps, channels, me);
	return channels.map((channel) => packChannelForApi(deps, channel, me, hint));
}

/**
 * SSR (web/client-pages.ts の /channels/:channel) から使う。
 * 未ログイン閲覧者向けなので me は常に null で、hint も単体分だけ組む。
 */
export async function packChannelForSsr(deps: ApiChannelsDependencies, channel: MiChannel): Promise<ApiPackedChannel> {
	const hint = await buildChannelPackHint(deps, [channel], null);
	return packChannelForApi(deps, channel, null, hint);
}

async function packChannelDetailedForApi(
	deps: ApiChannelsDependencies & ApiNoteDependencies,
	channel: MiChannel,
	me: MiLocalUser | null,
): Promise<ApiPackedChannel> {
	const hint = await buildChannelPackHint(deps, [channel], me);
	const packed = packChannelForApi(deps, channel, me, hint);

	const pinnedNotes =
		channel.pinnedNoteIds.length > 0 ? await listNotesByIdsFromDatabase(deps.db, channel.pinnedNoteIds) : [];
	const packedPinnedNotes = (await packNoteManyForApi(deps, pinnedNotes, me)).sort(
		(a, b) => channel.pinnedNoteIds.indexOf(a.id) - channel.pinnedNoteIds.indexOf(b.id),
	);

	return {
		...packed,
		pinnedNotes: packedPinnedNotes,
	};
}

export async function handleApiChannelsFeatured(
	deps: ApiChannelsDependencies,
	me: MiLocalUser | null,
): Promise<ApiPackedChannel[]> {
	const channels = await listRecentlyActiveChannelsFromDatabase(deps.db, 10);
	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsSearch(
	deps: ApiChannelsDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof channelsSearchParamDef>,
): Promise<ApiPackedChannel[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);
	const channels = await listChannelsBySearchFromDatabase(deps.db, {
		query: sqlLikeEscape(params.query),
		type: params.type,
		limit: params.limit,
		sinceId,
		untilId,
		order: sinceId != null && untilId == null ? 'asc' : 'desc',
	});

	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsOwned(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelsListParamDef>,
): Promise<ApiPackedChannel[]> {
	const channels = await listOwnedChannelsFromDatabase(deps.db, me.id, {
		...resolveDateIdPagination({ gen: genId }, params),
		limit: params.limit,
	});

	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsFollowed(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelsListParamDef>,
): Promise<ApiPackedChannel[]> {
	const followings = await listChannelFollowingsByFollowerIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		...resolveDateIdPagination({ gen: genId }, params),
	});
	const channelIds = followings.map((following) => following.followeeId);
	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsMyFavorites(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
): Promise<ApiPackedChannel[]> {
	const channelIds = await listFavoritedChannelIdsByUserIdFromDatabase(deps.db, me.id);
	if (channelIds.length === 0) {
		return [];
	}

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsCreate(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelCreateParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/create']>,
): Promise<ApiPackedChannel> {
	let bannerId: string | null = null;
	if (params.bannerId != null) {
		const banner = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.bannerId, me.id);
		if (banner == null) {
			throw errors.noSuchFile();
		}
		bannerId = banner.id;
	}

	const channel = await createChannelInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		name: params.name,
		description: params.description ?? null,
		bannerId,
		isSensitive: params.isSensitive ?? false,
		...(params.color !== undefined ? { color: params.color } : {}),
		allowRenoteToExternal: params.allowRenoteToExternal ?? true,
	});

	return packChannelForApi(deps, channel, me, await buildChannelPackHint(deps, [channel], me));
}

export async function handleApiChannelsUpdate(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelUpdateParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/update']>,
): Promise<ApiPackedChannel> {
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw errors.noSuchChannel();
	}

	const isModerator = await isApiModerator(deps, me);
	if (channel.userId !== me.id && !isModerator) {
		throw errors.accessDenied();
	}

	let banner: { id: string } | null | undefined;
	if (params.bannerId != null) {
		banner = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.bannerId, me.id);
		if (banner == null) {
			throw errors.noSuchFile();
		}
	} else if (params.bannerId === null) {
		banner = null;
	}

	await updateChannelInDatabase(deps.db, channel.id, {
		...(params.name !== undefined ? { name: params.name } : {}),
		...(params.description !== undefined ? { description: params.description } : {}),
		...(params.pinnedNoteIds !== undefined ? { pinnedNoteIds: params.pinnedNoteIds } : {}),
		...(params.color !== undefined ? { color: params.color } : {}),
		...(typeof params.isArchived === 'boolean' ? { isArchived: params.isArchived } : {}),
		...(banner ? { bannerId: banner.id } : {}),
		...(typeof params.isSensitive === 'boolean' ? { isSensitive: params.isSensitive } : {}),
		...(typeof params.allowRenoteToExternal === 'boolean'
			? { allowRenoteToExternal: params.allowRenoteToExternal }
			: {}),
	});

	const updated = await fetchChannelByIdFromDatabase(deps.db, channel.id);
	if (updated == null) {
		throw errors.noSuchChannel();
	}

	return packChannelForApi(deps, updated, me, await buildChannelPackHint(deps, [updated], me));
}

export async function handleApiChannelsFollow(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelFollowParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/follow']>,
): Promise<void> {
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw errors.noSuchChannel();
	}

	try {
		await createChannelFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: me.id,
			followeeId: targetChannel.id,
		});
	} catch (err) {
		// (followerId, followeeId) は unique なので、二重フォローは 500 ではなく明示的なエラーにする
		if (isDuplicateKeyValueDatabaseError(err)) {
			throw errors.alreadyFollowing();
		}
		throw err;
	}

	deps.publishInternalEvent?.('followChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleApiChannelsUnfollow(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelFollowParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/unfollow']>,
): Promise<void> {
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw errors.noSuchChannel();
	}

	await deleteChannelFollowingFromDatabase(deps.db, me.id, targetChannel.id);
	deps.publishInternalEvent?.('unfollowChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleApiChannelsMuteCreate(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelMuteCreateParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/mute/create']>,
): Promise<void> {
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw errors.noSuchChannel();
	}

	const exists = await channelMutingExistsInDatabase(deps.db, me.id, targetChannel.id);
	if (exists) {
		throw errors.alreadyMuting();
	}

	if (params.expiresAt && params.expiresAt <= Date.now()) {
		throw errors.expiresAtIsPast();
	}

	const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;
	try {
		await createChannelMutingInDatabase(deps.db, {
			id: genId(),
			userId: me.id,
			channelId: targetChannel.id,
			expiresAt,
		});
	} catch (err) {
		if (!isDuplicateKeyValueDatabaseError(err)) {
			throw err;
		}
		await updateChannelMutingExpirationInDatabase(deps.db, me.id, targetChannel.id, expiresAt);
	}

	deps.publishInternalEvent?.('muteChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleApiChannelsMuteDelete(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof channelMuteDeleteParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/mute/delete']>,
): Promise<void> {
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw errors.noSuchChannel();
	}

	const exists = await channelMutingExistsInDatabase(deps.db, me.id, targetChannel.id);
	if (!exists) {
		throw errors.notMuting();
	}

	await deleteChannelMutingFromDatabase(deps.db, me.id, targetChannel.id);
	deps.publishInternalEvent?.('unmuteChannel', {
		userId: me.id,
		channelId: targetChannel.id,
	});
}

export async function handleApiChannelsMuteList(
	deps: ApiChannelsDependencies,
	me: MiLocalUser,
): Promise<ApiPackedChannel[]> {
	const channelIds = await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date());
	if (channelIds.length === 0) {
		return [];
	}

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null)
		.sort((a, b) => a.id.localeCompare(b.id));

	return await packChannelsForApi(deps, channels, me);
}

export async function handleApiChannelsShow(
	deps: ApiChannelsDependencies & ApiNoteDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof channelShowParamDef>,
	errors: ContractErrors<(typeof channelsContracts)['channels/show']>,
): Promise<ApiPackedChannel> {
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw errors.noSuchChannel();
	}

	return await packChannelDetailedForApi(deps, channel, me);
}

export async function handleApiChannelsTimeline(
	deps: ApiChannelsDependencies & ApiNoteDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof channelTimelineParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw channelsTimelineNoSuchChannelError();
	}

	let mutingChannelIds: string[] = [];
	if (me) {
		mutingChannelIds = (await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date())).filter(
			(id) => id !== channel.id,
		);
	}

	const notes = await listChannelTimelineNotesFromDatabase(deps.db, {
		channelId: channel.id,
		limit: params.limit,
		sinceId,
		untilId,
		me,
		blockedHosts: deps.meta.blockedHosts,
		mutedChannelIds: mutingChannelIds,
	});

	return await packNoteManyForApi(deps, notes, me);
}
