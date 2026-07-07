/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import { channelFavoriteExistsInDatabase, createChannelFavoriteInDatabase, deleteChannelFavoriteFromDatabase } from '@/core/ChannelFavoriteStore.js';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import { clipFavoriteExistsInDatabase, createClipFavoriteInDatabase, deleteClipFavoriteByIdFromDatabase, fetchClipFavoriteFromDatabase } from '@/core/ClipFavoriteStore.js';
import { fetchClipByIdFromDatabase } from '@/core/ClipStore.js';
import { createFlashLikeInDatabase, deleteFlashLikeByIdFromDatabase, fetchFlashLikeFromDatabase, flashLikeExistsInDatabase } from '@/core/FlashLikeStore.js';
import { decrementFlashLikedCountInDatabase, fetchFlashByIdFromDatabase, incrementFlashLikedCountInDatabase } from '@/core/FlashStore.js';
import { listNoteFavoritesByUserIdFromDatabase } from '@/core/NoteFavoriteStore.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { createPageLikeInDatabase, deletePageLikeByIdFromDatabase, fetchPageLikeFromDatabase, pageLikeExistsInDatabase } from '@/core/PageLikeStore.js';
import { decrementPageLikedCountInDatabase, fetchPageByIdFromDatabase, incrementPageLikedCountInDatabase } from '@/core/PageStore.js';
import { createUserListFavoriteInDatabase, deleteUserListFavoriteByIdFromDatabase, fetchUserListFavoriteFromDatabase, userListFavoriteExistsInDatabase } from '@/core/UserListFavoriteStore.js';
import { userListExistsByIdAndPublicFromDatabase } from '@/core/UserListStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { clientErrorWithStatus } from './error.js';
import { resolveHonoApiIdPagination } from './following.js';
import { packNoteForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiFavoriteDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type HonoApiIFavoritesDependencies = HonoApiNoteDependencies;

export const userListParamDef = z.object({
	listId: misskeyId(),
});

export const clipParamDef = z.object({
	clipId: misskeyId(),
});

export const channelParamDef = z.object({
	channelId: misskeyId(),
});

export const pageParamDef = z.object({
	pageId: misskeyId(),
});

export const flashParamDef = z.object({
	flashId: misskeyId(),
});

type UserListParams = { listId: string };
type ClipParams = { clipId: string };
type ChannelParams = { channelId: string };
type PageParams = { pageId: string };
type FlashParams = { flashId: string };

export async function handleHonoApiUsersListsFavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(userListParamDef, body);
	const exists = await userListExistsByIdAndPublicFromDatabase(deps.db, params.listId);
	if (!exists) {
		throw clientErrorWithStatus(400, 'No such user list.', 'NO_SUCH_USER_LIST', '7dbaf3cf-7b42-4b8f-b431-b3919e580dbe');
	}

	if (await userListFavoriteExistsInDatabase(deps.db, me.id, params.listId)) {
		throw clientErrorWithStatus(400, 'The list has already been favorited.', 'ALREADY_FAVORITED', '6425bba0-985b-461e-af1b-518070e72081');
	}

	await createUserListFavoriteInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		userListId: params.listId,
	});
}

export async function handleHonoApiUsersListsUnfavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(userListParamDef, body);
	const exists = await userListExistsByIdAndPublicFromDatabase(deps.db, params.listId);
	if (!exists) {
		throw clientErrorWithStatus(400, 'No such user list.', 'NO_SUCH_USER_LIST', 'baedb33e-76b8-4b0c-86a8-9375c0a7b94b');
	}

	const favorite = await fetchUserListFavoriteFromDatabase(deps.db, me.id, params.listId);
	if (favorite == null) {
		throw clientErrorWithStatus(400, 'You have not favorited the list.', 'ALREADY_FAVORITED', '835c4b27-463d-4cfa-969b-a9058678d465');
	}

	await deleteUserListFavoriteByIdFromDatabase(deps.db, favorite.id);
}

export async function handleHonoApiClipsFavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(clipParamDef, body);
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null || (clip.userId !== me.id && !clip.isPublic)) {
		throw clientErrorWithStatus(400, 'No such clip.', 'NO_SUCH_CLIP', '4c2aaeae-80d8-4250-9606-26cb1fdb77a5');
	}

	if (await clipFavoriteExistsInDatabase(deps.db, me.id, clip.id)) {
		throw clientErrorWithStatus(400, 'The clip has already been favorited.', 'ALREADY_FAVORITED', '92658936-c625-4273-8326-2d790129256e');
	}

	await createClipFavoriteInDatabase(deps.db, {
		id: genId(deps.config),
		clipId: clip.id,
		userId: me.id,
	});
}

export async function handleHonoApiClipsUnfavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(clipParamDef, body);
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null) {
		throw clientErrorWithStatus(400, 'No such clip.', 'NO_SUCH_CLIP', '2603966e-b865-426c-94a7-af4a01241dc1');
	}

	const favorite = await fetchClipFavoriteFromDatabase(deps.db, me.id, clip.id);
	if (favorite == null) {
		throw clientErrorWithStatus(400, 'You have not favorited the clip.', 'NOT_FAVORITED', '90c3a9e8-b321-4dae-bf57-2bf79bbcc187');
	}

	await deleteClipFavoriteByIdFromDatabase(deps.db, favorite.id);
}

export async function handleHonoApiChannelsFavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelParamDef, body);
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw clientErrorWithStatus(400, 'No such channel.', 'NO_SUCH_CHANNEL', '4938f5f3-6167-4c04-9149-6607b7542861');
	}

	await createChannelFavoriteInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		channelId: channel.id,
	});
}

export async function handleHonoApiChannelsUnfavorite(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(channelParamDef, body);
	const channel = await fetchChannelByIdFromDatabase(deps.db, params.channelId);
	if (channel == null) {
		throw clientErrorWithStatus(400, 'No such channel.', 'NO_SUCH_CHANNEL', '353c68dd-131a-476c-aa99-88a345e83668');
	}

	await deleteChannelFavoriteFromDatabase(deps.db, me.id, channel.id);
}

export async function handleHonoApiPagesLike(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pageParamDef, body);
	const page = await fetchPageByIdFromDatabase(deps.db, params.pageId);
	if (page == null) {
		throw clientErrorWithStatus(400, 'No such page.', 'NO_SUCH_PAGE', 'cc98a8a2-0dc3-4123-b198-62c71df18ed3');
	}
	if (page.userId === me.id) {
		throw clientErrorWithStatus(400, 'You cannot like your page.', 'YOUR_PAGE', '28800466-e6db-40f2-8fae-bf9e82aa92b8');
	}

	if (await pageLikeExistsInDatabase(deps.db, me.id, page.id)) {
		throw clientErrorWithStatus(400, 'The page has already been liked.', 'ALREADY_LIKED', 'd4c1edbe-7da2-4eae-8714-1acfd2d63941');
	}

	try {
		await createPageLikeInDatabase(deps.db, {
			id: genId(deps.config),
			pageId: page.id,
			userId: me.id,
		});
	} catch (err) {
		if (isDuplicateKeyValueDatabaseError(err)) {
			throw clientErrorWithStatus(400, 'The page has already been liked.', 'ALREADY_LIKED', 'd4c1edbe-7da2-4eae-8714-1acfd2d63941');
		}
		throw err;
	}

	void incrementPageLikedCountInDatabase(deps.db, page.id);
}

export async function handleHonoApiPagesUnlike(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pageParamDef, body);
	const page = await fetchPageByIdFromDatabase(deps.db, params.pageId);
	if (page == null) {
		throw clientErrorWithStatus(400, 'No such page.', 'NO_SUCH_PAGE', 'a0d41e20-1993-40bd-890e-f6e560ae648e');
	}

	const like = await fetchPageLikeFromDatabase(deps.db, me.id, page.id);
	if (like == null) {
		throw clientErrorWithStatus(400, 'You have not liked that page.', 'NOT_LIKED', 'f5e586b0-ce93-4050-b0e3-7f31af5259ee');
	}

	await deletePageLikeByIdFromDatabase(deps.db, like.id);
	void decrementPageLikedCountInDatabase(deps.db, page.id);
}

export async function handleHonoApiFlashLike(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashParamDef, body);
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'c07c1491-9161-4c5c-9d75-01906f911f73');
	}
	if (flash.userId === me.id) {
		throw clientErrorWithStatus(400, 'You cannot like your flash.', 'YOUR_FLASH', '3fd8a0e7-5955-4ba9-85bb-bf3e0c30e13b');
	}

	if (await flashLikeExistsInDatabase(deps.db, me.id, flash.id)) {
		throw clientErrorWithStatus(400, 'The flash has already been liked.', 'ALREADY_LIKED', '010065cf-ad43-40df-8067-abff9f4686e3');
	}

	try {
		await createFlashLikeInDatabase(deps.db, {
			id: genId(deps.config),
			flashId: flash.id,
			userId: me.id,
		});
	} catch (err) {
		if (isDuplicateKeyValueDatabaseError(err)) {
			throw clientErrorWithStatus(400, 'The flash has already been liked.', 'ALREADY_LIKED', '010065cf-ad43-40df-8067-abff9f4686e3');
		}
		throw err;
	}

	void incrementFlashLikedCountInDatabase(deps.db, flash.id);
}

export async function handleHonoApiFlashUnlike(
	deps: HonoApiFavoriteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashParamDef, body);
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'afe8424a-a69e-432d-a5f2-2f0740c62410');
	}

	const like = await fetchFlashLikeFromDatabase(deps.db, me.id, flash.id);
	if (like == null) {
		throw clientErrorWithStatus(400, 'You have not liked that flash.', 'NOT_LIKED', '755f25a7-9871-4f65-9f34-51eaad9ae0ac');
	}

	await deleteFlashLikeByIdFromDatabase(deps.db, like.id);
	void decrementFlashLikedCountInDatabase(deps.db, flash.id);
}

export const iFavoritesParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type IFavoritesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiIFavorites(
	deps: HonoApiIFavoritesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(iFavoritesParamDef, body);
	const pagination = resolveHonoApiIdPagination(deps.config, params);

	const favorites = await listNoteFavoritesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	const notes = favorites.length === 0 ? [] : await listNotesByIdsFromDatabase(deps.db, favorites.map(f => f.noteId));
	const noteMap = new Map(notes.map(note => [note.id, note]));

	return await Promise.all(favorites.map(async favorite => ({
		id: favorite.id,
		createdAt: parseId(deps.config, favorite.id).date.toISOString(),
		noteId: favorite.noteId,
		note: await packNoteForHonoApi(deps, noteMap.get(favorite.noteId) ?? favorite.noteId, me),
	})));
}
