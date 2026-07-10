/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { announcementReadExistsInDatabase, createAnnouncementReadInDatabase, listReadAnnouncementIdsByUserIdAndAnnouncementIdsFromDatabase } from '@/core/AnnouncementReadStore.js';
import { fetchAnnouncementByIdFromDatabase, listAnnouncementsForUserFromDatabase, listUnreadAnnouncementsForUserFromDatabase, resolveAnnouncementPagination, updateAnnouncementInDatabase } from '@/core/AnnouncementStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAnnouncement, MiUser } from '@/models/_.js';
import { HonoApiError } from './error.js';
import type { HonoApiMainStreamPublisher } from './events.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAnnouncementDependencies = {
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
	announcement: MiAnnouncement & { isRead?: boolean | null },
	user: { id: MiUser['id'] } | null,
): Promise<Packed<'Announcement'>> {
	let isRead = announcement.isRead;
	if (user != null && isRead === undefined) {
		isRead = await announcementReadExistsInDatabase(deps.db, user.id, announcement.id);
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
	};
}

export async function handleHonoApiAnnouncements(
	deps: HonoApiAnnouncementDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Packed<'Announcement'>[]> {
	const params = parseHonoApiParams(announcementsParamDef, body);
	const announcements = await listAnnouncementsForUserFromDatabase(deps.db, {
		limit: params.limit,
		...resolveAnnouncementPagination({
			gen: time => genId(time),
		}, params),
		isActive: params.isActive,
		requestUserId: user?.id,
	});
	const readAnnouncementIds = user == null
		? new Set<MiAnnouncement['id']>()
		: new Set(await listReadAnnouncementIdsByUserIdAndAnnouncementIdsFromDatabase(deps.db, user.id, announcements.map(announcement => announcement.id)));

	return await Promise.all(announcements.map(announcement => packHonoApiAnnouncement(deps, {
		...announcement,
		...(user == null ? {} : { isRead: readAnnouncementIds.has(announcement.id) }),
	}, user)));
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
