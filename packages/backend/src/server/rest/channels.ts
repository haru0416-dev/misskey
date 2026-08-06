/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	fetchFavoritedChannelIdsByUserIdAndChannelIdsFromDatabase,
	listFavoritedChannelIdsByUserIdFromDatabase,
} from '@/core/ChannelFavoriteStore.js';
import {
	createChannelFollowingInDatabase,
	deleteChannelFollowingFromDatabase,
	fetchFollowedChannelIdsByUserIdAndChannelIdsFromDatabase,
	listChannelFollowingsByFollowerIdFromDatabase,
} from '@/core/ChannelFollowingStore.js';
import {
	channelMutingExistsInDatabase,
	createChannelMutingInDatabase,
	deleteChannelMutingFromDatabase,
	listActiveMutedChannelIdsByUserIdFromDatabase,
	fetchMutedChannelIdsByUserIdAndChannelIdsFromDatabase,
	updateChannelMutingExpirationInDatabase,
} from '@/core/ChannelMutingStore.js';
import {
	createChannelInDatabase,
	listChannelsByIdsFromDatabase,
	listChannelsBySearchFromDatabase,
	listOwnedChannelsFromDatabase,
	listRecentlyActiveChannelsFromDatabase,
	resolveChannelPagination,
	fetchChannelByIdFromDatabase,
	updateChannelInDatabase,
} from '@/core/ChannelStore.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { fetchDriveFileByIdAndUserIdFromDatabase, listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import { listChannelTimelineNotesFromDatabase, listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { isHonoApiModerator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiChannelsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

type HonoApiPackedChannel = Packed<'Channel'>;

export const channelsListParamDef = z.object({
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(5),
});

type ChannelsListParams = {
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	limit: number;
};

export const channelsSearchParamDef = z.object({
	query: z.string(),
	type: z.enum(['nameAndDescription', 'nameOnly']).optional().default('nameAndDescription'),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(5),
});

type ChannelsSearchParams = ChannelsListParams & {
	query: string;
	type: 'nameAndDescription' | 'nameOnly';
};

export const emptyParamDef = z.object({});

export const channelCreateParamDef = z.object({
	name: z.string().min(1).max(128),
	description: z.string().max(2048).nullable().optional(),
	bannerId: misskeyId().nullable().optional(),
	color: z.string().min(1).max(16).optional(),
	isSensitive: z.boolean().nullable().optional(),
	allowRenoteToExternal: z.boolean().nullable().optional(),
});

type ChannelCreateParams = {
	name: string;
	description?: string | null;
	bannerId?: string | null;
	color?: string;
	isSensitive?: boolean | null;
	allowRenoteToExternal?: boolean | null;
};

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

type ChannelUpdateParams = {
	channelId: string;
	name?: string;
	description?: string | null;
	bannerId?: string | null;
	isArchived?: boolean | null;
	pinnedNoteIds?: string[];
	color?: string;
	isSensitive?: boolean | null;
	allowRenoteToExternal?: boolean | null;
};

export const channelFollowParamDef = z.object({
	channelId: misskeyId(),
});

type ChannelFollowParams = {
	channelId: string;
};

export const channelMuteCreateParamDef = z.object({
	channelId: misskeyId(),
	expiresAt: z.number().int().nullable().optional(),
});

type ChannelMuteCreateParams = {
	channelId: string;
	expiresAt?: number | null;
};

export const channelMuteDeleteParamDef = z.object({
	channelId: misskeyId(),
});

type ChannelMuteDeleteParams = {
	channelId: string;
};

export const channelShowParamDef = z.object({
	channelId: misskeyId(),
});

type ChannelShowParams = {
	channelId: string;
};

export const channelTimelineParamDef = z.object({
	channelId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChannelTimelineParams = {
	channelId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

function channelsShowNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: '6f6c314b-7486-4897-8966-c04a66a02923',
	});
}

function channelsTimelineNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: '4d0eeeba-a02c-4c3c-9966-ef60d38d2e7f',
	});
}

function channelCreateNoSuchFileError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such file.',
		code: 'NO_SUCH_FILE',
		id: 'cd1e9f3e-5a12-4ab4-96f6-5d0a2cc32050',
	});
}

function channelUpdateNoSuchChannelError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: 'f9c5467f-d492-4c3c-9a8d-a70dacc86512',
	});
}

function channelUpdateAccessDeniedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You do not have edit privilege of the channel.',
		code: 'ACCESS_DENIED',
		id: '1fb7cb09-d46a-4fdf-b8df-057788cce513',
	});
}

function channelUpdateNoSuchFileError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such file.',
		code: 'NO_SUCH_FILE',
		id: 'e86c14a4-0da2-4032-8df3-e737a04c7f3b',
	});
}

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

function packChannelForHonoApi(
	deps: HonoApiChannelsDependencies,
	channel: MiChannel,
	me: MiLocalUser | null,
	hint: ChannelPackHint,
): HonoApiPackedChannel {
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

async function packChannelsForHonoApi(
	deps: HonoApiChannelsDependencies,
	channels: MiChannel[],
	me: MiLocalUser | null,
): Promise<HonoApiPackedChannel[]> {
	const hint = await buildChannelPackHint(deps, channels, me);
	return channels.map((channel) => packChannelForHonoApi(deps, channel, me, hint));
}

async function packChannelDetailedForHonoApi(
	deps: HonoApiChannelsDependencies & HonoApiNoteDependencies,
	channel: MiChannel,
	me: MiLocalUser | null,
): Promise<HonoApiPackedChannel> {
	const hint = await buildChannelPackHint(deps, [channel], me);
	const packed = packChannelForHonoApi(deps, channel, me, hint);

	const pinnedNotes =
		channel.pinnedNoteIds.length > 0 ? await listNotesByIdsFromDatabase(deps.db, channel.pinnedNoteIds) : [];
	const packedPinnedNotes = (await packNoteManyForHonoApi(deps, pinnedNotes, me)).sort(
		(a, b) => channel.pinnedNoteIds.indexOf(a.id) - channel.pinnedNoteIds.indexOf(b.id),
	);

	return {
		...packed,
		pinnedNotes: packedPinnedNotes,
	};
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
	const params = parseHonoApiParams(channelsSearchParamDef, body);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
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
	const params = parseHonoApiParams(channelsListParamDef, body);
	const channels = await listOwnedChannelsFromDatabase(deps.db, me.id, {
		...resolveChannelPagination(
			{
				gen: (time?: number) => genId(time),
			},
			params,
		),
		limit: params.limit,
	});

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsFollowed(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	const params = parseHonoApiParams(channelsListParamDef, body);
	const followings = await listChannelFollowingsByFollowerIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		...resolveChannelPagination(
			{
				gen: (time?: number) => genId(time),
			},
			params,
		),
	});
	const channelIds = followings.map((following) => following.followeeId);
	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsMyFavorites(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel[]> {
	parseHonoApiParams(emptyParamDef, body);
	const channelIds = await listFavoritedChannelIdsByUserIdFromDatabase(deps.db, me.id);
	if (channelIds.length === 0) return [];

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null);

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsCreate(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel> {
	const params = parseHonoApiParams(channelCreateParamDef, body);
	let bannerId: string | null = null;
	if (params.bannerId != null) {
		const banner = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.bannerId, me.id);
		if (banner == null) {
			throw channelCreateNoSuchFileError();
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

	return packChannelForHonoApi(deps, channel, me, await buildChannelPackHint(deps, [channel], me));
}

export async function handleHonoApiChannelsUpdate(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel> {
	const params = parseHonoApiParams(channelUpdateParamDef, body);
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw channelUpdateNoSuchChannelError();
	}

	const isModerator = await isHonoApiModerator(deps, me);
	if (channel.userId !== me.id && !isModerator) {
		throw channelUpdateAccessDeniedError();
	}

	let banner: { id: string } | null | undefined;
	if (params.bannerId != null) {
		banner = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.bannerId, me.id);
		if (banner == null) {
			throw channelUpdateNoSuchFileError();
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
		throw channelUpdateNoSuchChannelError();
	}

	return packChannelForHonoApi(deps, updated, me, await buildChannelPackHint(deps, [updated], me));
}

export async function handleHonoApiChannelsFollow(
	deps: HonoApiChannelsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelFollowParamDef, body);
	const targetChannel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (targetChannel == null) {
		throw channelFollowNoSuchChannelError();
	}

	await createChannelFollowingInDatabase(deps.db, {
		id: genId(),
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
	const params = parseHonoApiParams(channelFollowParamDef, body);
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
	const params = parseHonoApiParams(channelMuteCreateParamDef, body);
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
			id: genId(),
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
	const params = parseHonoApiParams(channelMuteDeleteParamDef, body);
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
	const channelIds = await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date());
	if (channelIds.length === 0) return [];

	const channelById = await listChannelsByIdsFromDatabase(deps.db, channelIds).then(
		(channels) => new Map(channels.map((channel) => [channel.id, channel])),
	);
	const channels = channelIds
		.map((id) => channelById.get(id))
		.filter((channel): channel is MiChannel => channel != null)
		.sort((a, b) => a.id.localeCompare(b.id));

	return await packChannelsForHonoApi(deps, channels, me);
}

export async function handleHonoApiChannelsShow(
	deps: HonoApiChannelsDependencies & HonoApiNoteDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<HonoApiPackedChannel> {
	const params = parseHonoApiParams(channelShowParamDef, body);
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) throw channelsShowNoSuchChannelError();

	return await packChannelDetailedForHonoApi(deps, channel, me);
}

export async function handleHonoApiChannelsTimeline(
	deps: HonoApiChannelsDependencies & HonoApiNoteDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(channelTimelineParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) throw channelsTimelineNoSuchChannelError();

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

	return await packNoteManyForHonoApi(deps, notes, me);
}
