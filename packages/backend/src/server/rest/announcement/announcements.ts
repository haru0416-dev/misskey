/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	countAnnouncementReactionsByAnnouncementIdsFromDatabase,
	createAnnouncementReactionInDatabase,
	deleteAnnouncementReactionInDatabase,
	listMyAnnouncementReactionsFromDatabase,
} from '@/core/announcement/AnnouncementReactionStore.js';
import {
	announcementReadExistsInDatabase,
	createAnnouncementReadInDatabase,
	listReadAnnouncementIdsByUserIdAndAnnouncementIdsFromDatabase,
} from '@/core/announcement/AnnouncementReadStore.js';
import {
	fetchAnnouncementByIdFromDatabase,
	listAnnouncementsForUserFromDatabase,
	listUnreadAnnouncementsForUserFromDatabase,
	resolveAnnouncementPagination,
	updateAnnouncementInDatabase,
} from '@/core/announcement/AnnouncementStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAnnouncement, MiUser } from '@/models/_.js';
import { omitUndefined } from '@/misc/clone.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/emoji/EmojiStore.js';
import { normalizeReactionForHonoApi } from '../note/notes-reactions.js';
import { getHonoApiUserRoles, type HonoApiRolePolicyDependencies } from '../role/role-policy.js';
import { HonoApiError } from '../error.js';
import type { HonoApiMainStreamPublisher } from '../events.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiAnnouncementDependencies = HonoApiRolePolicyDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	publishMainStream?: HonoApiMainStreamPublisher;
};

export const announcementsParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	isActive: z.boolean().default(true),
});

export const announcementShowParamDef = z.object({
	announcementId: misskeyId(),
});

export const readAnnouncementParamDef = z.object({
	announcementId: misskeyId(),
});

export const announcementReactParamDef = z.object({
	announcementId: misskeyId(),
	reaction: z.string().min(1).max(100),
});

export const announcementUnreactParamDef = z.object({
	announcementId: misskeyId(),
});

function noSuchAnnouncementError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such announcement.',
		code: 'NO_SUCH_ANNOUNCEMENT',
		id: 'b57b5e1d-4f49-404a-9edb-46b00268f121',
	});
}

async function packHonoApiAnnouncement(
	deps: HonoApiAnnouncementDependencies,
	announcement: MiAnnouncement & {
		isRead?: boolean | null;
		reactions?: Record<string, number>;
		myReaction?: string | null;
	},
	user: { id: MiUser['id'] } | null,
): Promise<Packed<'Announcement'>> {
	let isRead = announcement.isRead;
	if (user != null && isRead === undefined) {
		isRead = await announcementReadExistsInDatabase(deps.db, user.id, announcement.id);
	}

	let reactions = announcement.reactions;
	if (reactions === undefined) {
		reactions =
			(await countAnnouncementReactionsByAnnouncementIdsFromDatabase(deps.db, [announcement.id])).get(
				announcement.id,
			) ?? {};
	}

	let myReaction = announcement.myReaction;
	if (user != null && myReaction === undefined) {
		myReaction =
			(await listMyAnnouncementReactionsFromDatabase(deps.db, user.id, [announcement.id])).get(announcement.id) ?? null;
	}

	return {
		id: announcement.id,
		createdAt: parseId(announcement.id).date.toISOString(),
		updatedAt: announcement.updatedAt?.toISOString() ?? null,
		title: announcement.title,
		text: announcement.text,
		imageUrl: announcement.imageUrl,
		icon: announcement.icon,
		display: announcement.display,
		forYou: announcement.userId === user?.id,
		needConfirmationToRead: announcement.needConfirmationToRead,
		silence: announcement.silence,
		isRead: isRead !== null ? isRead : undefined,
		reactions,
		myReaction: user == null ? undefined : (myReaction ?? null),
	};
}

export async function handleHonoApiAnnouncements(
	deps: HonoApiAnnouncementDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Packed<'Announcement'>[]> {
	const params = parseHonoApiParams(announcementsParamDef, body);
	const announcements = await listAnnouncementsForUserFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			...resolveAnnouncementPagination(
				{
					gen: (time) => genId(time),
				},
				params,
			),
			isActive: params.isActive,
			requestUserId: user?.id,
		}),
	);
	const announcementIds = announcements.map((announcement) => announcement.id);
	// 一覧では件数分の問い合わせを増やさないよう、既読とリアクションをまとめて引く。
	const [readAnnouncementIds, reactionCounts, myReactions] = await Promise.all([
		user == null
			? Promise.resolve<MiAnnouncement['id'][]>([])
			: listReadAnnouncementIdsByUserIdAndAnnouncementIdsFromDatabase(deps.db, user.id, announcementIds),
		countAnnouncementReactionsByAnnouncementIdsFromDatabase(deps.db, announcementIds),
		user == null
			? Promise.resolve(new Map<MiAnnouncement['id'], string>())
			: listMyAnnouncementReactionsFromDatabase(deps.db, user.id, announcementIds),
	]);
	const readAnnouncementIdSet = new Set(readAnnouncementIds);

	return await Promise.all(
		announcements.map((announcement) =>
			packHonoApiAnnouncement(
				deps,
				{
					...announcement,
					...(user == null ? {} : { isRead: readAnnouncementIdSet.has(announcement.id) }),
					reactions: reactionCounts.get(announcement.id) ?? {},
					...(user == null ? {} : { myReaction: myReactions.get(announcement.id) ?? null }),
				},
				user,
			),
		),
	);
}

export async function handleHonoApiAnnouncementShow(
	deps: HonoApiAnnouncementDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Packed<'Announcement'>> {
	const params = parseHonoApiParams(announcementShowParamDef, body);
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.announcementId);
	if (announcement == null) throw noSuchAnnouncementError();
	if (announcement.userId != null && announcement.userId !== user?.id) throw noSuchAnnouncementError();

	return await packHonoApiAnnouncement(deps, announcement, user);
}

export async function handleHonoApiIReadAnnouncement(
	deps: HonoApiAnnouncementDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(readAnnouncementParamDef, body);

	const created = await createAnnouncementReadInDatabase(deps.db, {
		id: genId(),
		announcementId: params.announcementId,
		userId: me.id,
	});
	if (!created) return;

	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.announcementId);
	if (announcement != null && announcement.userId === me.id) {
		await updateAnnouncementInDatabase(deps.db, params.announcementId, {
			isActive: false,
		});
	}

	const unread = await listUnreadAnnouncementsForUserFromDatabase(deps.db, me.id);
	if (unread.length === 0) {
		deps.publishMainStream?.(me.id, 'readAllAnnouncements');
	}
}

function reactAnnouncementNotFoundError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such announcement.',
		code: 'NO_SUCH_ANNOUNCEMENT',
		id: 'b1e8f640-5acc-4a77-8337-928a5362f57e',
	});
}

function alreadyReactedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are already reacting to that announcement.',
		code: 'ALREADY_REACTED',
		id: '745c33cb-cd64-4c08-b88a-7bffa45e0c1f',
	});
}

function notReactedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are not reacting to that announcement.',
		code: 'NOT_REACTED',
		id: '0d7d5424-466e-45a2-9ed0-9e27c4b9f4a5',
	});
}

const isCustomEmojiReaction = /^:([\w+-]+)(?:@\.)?:$/;

/**
 * お知らせはローカル限定なので、使えるのは Unicode 絵文字とこのサーバーのカスタム絵文字だけ。
 * 使えないものが来たら弾かずにフォールバックへ寄せる (ノートのリアクションと同じ扱い)。
 */
async function normalizeAnnouncementReaction(
	deps: HonoApiAnnouncementDependencies,
	me: MiUser,
	requested: string,
): Promise<string> {
	const custom = requested.match(isCustomEmojiReaction);
	if (custom == null) return normalizeReactionForHonoApi(requested);

	const name = custom[1]!;
	const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, null);
	if (emoji == null) return normalizeReactionForHonoApi(null);

	if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0) {
		const roles = await getHonoApiUserRoles(deps, me);
		const allowed = roles.some((role) => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.includes(role.id));
		if (!allowed) return normalizeReactionForHonoApi(null);
	}

	return `:${name}:`;
}

async function fetchReactableAnnouncement(
	deps: HonoApiAnnouncementDependencies,
	me: MiUser,
	announcementId: MiAnnouncement['id'],
): Promise<MiAnnouncement> {
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, announcementId);
	if (announcement == null) throw reactAnnouncementNotFoundError();
	// 個人宛のお知らせは宛先本人にしか見えない。
	if (announcement.userId != null && announcement.userId !== me.id) throw reactAnnouncementNotFoundError();
	return announcement;
}

export async function handleHonoApiAnnouncementReact(
	deps: HonoApiAnnouncementDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(announcementReactParamDef, body);
	await fetchReactableAnnouncement(deps, me, params.announcementId);

	const reaction = await normalizeAnnouncementReaction(deps, me, params.reaction);
	const created = await createAnnouncementReactionInDatabase(deps.db, {
		id: genId(),
		announcementId: params.announcementId,
		userId: me.id,
		reaction,
	});
	if (!created) throw alreadyReactedError();
}

export async function handleHonoApiAnnouncementUnreact(
	deps: HonoApiAnnouncementDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(announcementUnreactParamDef, body);
	await fetchReactableAnnouncement(deps, me, params.announcementId);

	const deleted = await deleteAnnouncementReactionInDatabase(deps.db, me.id, params.announcementId);
	if (!deleted) throw notReactedError();
}
