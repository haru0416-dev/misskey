/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	createAnnouncementWithSideEffects,
	deleteAnnouncementWithModerationLog,
	updateAnnouncementWithModerationLog,
	type AnnouncementCreateValues,
	type AnnouncementUpdateValues,
} from '@/core/announcement/AnnouncementLogic.js';
import { countAnnouncementReadsByAnnouncementIdsFromDatabase } from '@/core/announcement/AnnouncementReadStore.js';
import { omitUndefined } from '@/misc/clone.js';
import {
	fetchAnnouncementByIdFromDatabase,
	listAnnouncementsForAdminFromDatabase,
	resolveAnnouncementPagination,
} from '@/core/announcement/AnnouncementStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { ApiBroadcastStreamPublisher, ApiMainStreamPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminAnnouncementDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishMainStream?: ApiMainStreamPublisher;
	publishBroadcastStream?: ApiBroadcastStreamPublisher;
};

type AdminAnnouncement = {
	id: string;
	createdAt: string;
	updatedAt: string | null;
	text: string;
	title: string;
	icon: string;
	display: string;
	isActive: boolean;
	forExistingUsers: boolean;
	silence: boolean;
	needConfirmationToRead: boolean;
	userId: string | null;
	imageUrl: string | null;
	reads: number;
};

export const adminAnnouncementsCreateParamDef = z.object({
	title: z.string().min(1),
	text: z.string().min(1),
	imageUrl: z.string().min(0).nullable(),
	icon: z.enum(['info', 'warning', 'error', 'success']).default('info'),
	display: z.enum(['normal', 'banner', 'dialog']).default('normal'),
	forExistingUsers: z.boolean().default(false),
	silence: z.boolean().default(false),
	needConfirmationToRead: z.boolean().default(false),
	userId: misskeyId().nullable().default(null),
});

export const adminAnnouncementsDeleteParamDef = z.object({
	id: misskeyId(),
});

export const adminAnnouncementsListParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	...paginationParams,
	userId: misskeyId().nullable().optional(),
	status: z.enum(['all', 'active', 'archived']).default('active'),
});

export const adminAnnouncementsUpdateParamDef = z.object({
	id: misskeyId(),
	title: z.string().min(1).optional(),
	text: z.string().min(1).optional(),
	imageUrl: z.string().min(0).nullable().optional(),
	icon: z.enum(['info', 'warning', 'error', 'success']).optional(),
	display: z.enum(['normal', 'banner', 'dialog']).optional(),
	forExistingUsers: z.boolean().optional(),
	silence: z.boolean().optional(),
	needConfirmationToRead: z.boolean().optional(),
	isActive: z.boolean().optional(),
});

function noSuchAnnouncementError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such announcement.',
		code: 'NO_SUCH_ANNOUNCEMENT',
		id,
	});
}

export function packAnnouncementForApi(
	config: Config,
	announcement: MiAnnouncement & { isRead?: boolean | null; reactions?: Record<string, number> },
	me?: { id: MiUser['id'] } | null,
): Packed<'Announcement'> {
	return {
		id: announcement.id,
		createdAt: parseId(announcement.id).date.toISOString(),
		updatedAt: announcement.updatedAt?.toISOString() ?? null,
		title: announcement.title,
		text: announcement.text,
		imageUrl: announcement.imageUrl,
		icon: announcement.icon,
		display: announcement.display,
		forYou: announcement.userId === me?.id,
		needConfirmationToRead: announcement.needConfirmationToRead,
		silence: announcement.silence,
		isRead: announcement.isRead !== null ? announcement.isRead : undefined,
		// SSR とお知らせ作成直後の配信はリアクションを読まないので、渡されなければ空。
		reactions: announcement.reactions ?? {},
	};
}

function packAdminAnnouncementForApi(config: Config, announcement: MiAnnouncement, reads: number): AdminAnnouncement {
	return {
		id: announcement.id,
		createdAt: parseId(announcement.id).date.toISOString(),
		updatedAt: announcement.updatedAt?.toISOString() ?? null,
		title: announcement.title,
		text: announcement.text,
		imageUrl: announcement.imageUrl,
		icon: announcement.icon,
		display: announcement.display,
		isActive: announcement.isActive,
		forExistingUsers: announcement.forExistingUsers,
		silence: announcement.silence,
		needConfirmationToRead: announcement.needConfirmationToRead,
		userId: announcement.userId,
		reads,
	};
}

export async function handleApiAdminAnnouncementsCreate(
	deps: ApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Announcement'>> {
	const params = parseApiParams(adminAnnouncementsCreateParamDef, body);
	const { packed } = await createAnnouncementWithSideEffects(
		{
			db: deps.db,
			genId,
			packAnnouncement: (announcement) => Promise.resolve(packAnnouncementForApi(deps.config, announcement)),
			publishMainStream: (userId, type, value) => deps.publishMainStream?.(userId, type, value),
			publishBroadcastStream: (type, value) => deps.publishBroadcastStream?.(type, value),
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		{
			updatedAt: null,
			title: params.title,
			text: params.text,
			imageUrl: params.imageUrl || null,
			icon: params.icon,
			display: params.display,
			forExistingUsers: params.forExistingUsers,
			silence: params.silence,
			needConfirmationToRead: params.needConfirmationToRead,
			userId: params.userId,
		} as AnnouncementCreateValues,
		me,
	);

	return packed;
}

export async function handleApiAdminAnnouncementsDelete(
	deps: ApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAnnouncementsDeleteParamDef, body);
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.id);

	if (announcement == null) throw noSuchAnnouncementError('ecad8040-a276-4e85-bda9-015a708d291e');

	await deleteAnnouncementWithModerationLog(
		{
			db: deps.db,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		announcement,
		me,
	);
}

export async function handleApiAdminAnnouncementsList(
	deps: ApiAdminAnnouncementDependencies,
	body: Record<string, unknown>,
): Promise<AdminAnnouncement[]> {
	const params = parseApiParams(adminAnnouncementsListParamDef, body);
	const announcements = await listAnnouncementsForAdminFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			...resolveAnnouncementPagination({ gen: (time) => genId(time) }, params),
			status: params.status,
			userId: params.userId,
		}),
	);
	const reads = await countAnnouncementReadsByAnnouncementIdsFromDatabase(
		deps.db,
		announcements.map((announcement) => announcement.id),
	);

	return announcements.map((announcement) =>
		packAdminAnnouncementForApi(deps.config, announcement, reads.get(announcement.id) ?? 0),
	);
}

export async function handleApiAdminAnnouncementsUpdate(
	deps: ApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAnnouncementsUpdateParamDef, body);
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.id);

	if (announcement == null) throw noSuchAnnouncementError('d3aae5a7-6372-4cb4-b61c-f511ffc2d7cc');

	await updateAnnouncementWithModerationLog(
		{
			db: deps.db,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		announcement,
		{
			title: params.title,
			text: params.text,
			imageUrl: params.imageUrl || null,
			display: params.display,
			icon: params.icon,
			forExistingUsers: params.forExistingUsers,
			silence: params.silence,
			needConfirmationToRead: params.needConfirmationToRead,
			isActive: params.isActive,
		} as AnnouncementUpdateValues,
		me,
	);
}
