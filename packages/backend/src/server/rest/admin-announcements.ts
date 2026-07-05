/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import {
	createAnnouncementWithSideEffects,
	deleteAnnouncementWithModerationLog,
	updateAnnouncementWithModerationLog,
	type AnnouncementCreateValues,
	type AnnouncementUpdateValues,
} from '@/core/AnnouncementLogic.js';
import { countAnnouncementReadsByAnnouncementIdsFromDatabase } from '@/core/AnnouncementReadStore.js';
import {
	fetchAnnouncementByIdFromDatabase,
	listAnnouncementsForAdminFromDatabase,
	resolveAnnouncementPagination,
} from '@/core/AnnouncementStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { HonoApiBroadcastStreamPublisher, HonoApiMainStreamPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminAnnouncementDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishMainStream?: HonoApiMainStreamPublisher;
	publishBroadcastStream?: HonoApiBroadcastStreamPublisher;
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

const adminAnnouncementsCreateParamDef = {
	type: 'object',
	properties: {
		title: { type: 'string', minLength: 1 },
		text: { type: 'string', minLength: 1 },
		imageUrl: { type: 'string', nullable: true, minLength: 0 },
		icon: { type: 'string', enum: ['info', 'warning', 'error', 'success'], default: 'info' },
		display: { type: 'string', enum: ['normal', 'banner', 'dialog'], default: 'normal' },
		forExistingUsers: { type: 'boolean', default: false },
		silence: { type: 'boolean', default: false },
		needConfirmationToRead: { type: 'boolean', default: false },
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: ['title', 'text', 'imageUrl'],
} as const;

const adminAnnouncementsDeleteParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminAnnouncementsListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		status: { type: 'string', enum: ['all', 'active', 'archived'], default: 'active' },
	},
	required: [],
} as const;

const adminAnnouncementsUpdateParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		title: { type: 'string', minLength: 1 },
		text: { type: 'string', minLength: 1 },
		imageUrl: { type: 'string', nullable: true, minLength: 0 },
		icon: { type: 'string', enum: ['info', 'warning', 'error', 'success'] },
		display: { type: 'string', enum: ['normal', 'banner', 'dialog'] },
		forExistingUsers: { type: 'boolean' },
		silence: { type: 'boolean' },
		needConfirmationToRead: { type: 'boolean' },
		isActive: { type: 'boolean' },
	},
	required: ['id'],
} as const;

type AdminAnnouncementsCreateParams = SchemaType<typeof adminAnnouncementsCreateParamDef>;
type AdminAnnouncementsDeleteParams = SchemaType<typeof adminAnnouncementsDeleteParamDef>;
type AdminAnnouncementsListParams = SchemaType<typeof adminAnnouncementsListParamDef>;
type AdminAnnouncementsUpdateParams = SchemaType<typeof adminAnnouncementsUpdateParamDef>;

function noSuchAnnouncementError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such announcement.',
		code: 'NO_SUCH_ANNOUNCEMENT',
		id,
	});
}

export function packAnnouncementForHonoApi(
	config: Config,
	announcement: MiAnnouncement & { isRead?: boolean | null },
	me?: { id: MiUser['id'] } | null,
): Packed<'Announcement'> {
	return {
		id: announcement.id,
		createdAt: parseId(config, announcement.id).date.toISOString(),
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
	};
}

function packAdminAnnouncementForHonoApi(
	config: Config,
	announcement: MiAnnouncement,
	reads: number,
): AdminAnnouncement {
	return {
		id: announcement.id,
		createdAt: parseId(config, announcement.id).date.toISOString(),
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

export async function handleHonoApiAdminAnnouncementsCreate(
	deps: HonoApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Announcement'>> {
	const params = parseHonoApiParams(adminAnnouncementsCreateParamDef, body) as AdminAnnouncementsCreateParams;
	const { packed } = await createAnnouncementWithSideEffects({
		db: deps.db,
		genId: () => genId(deps.config),
		packAnnouncement: announcement => Promise.resolve(packAnnouncementForHonoApi(deps.config, announcement)),
		publishMainStream: (userId, type, value) => deps.publishMainStream?.(userId, type, value),
		publishBroadcastStream: (type, value) => deps.publishBroadcastStream?.(type, value),
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, {
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
	} as AnnouncementCreateValues, me);

	return packed;
}

export async function handleHonoApiAdminAnnouncementsDelete(
	deps: HonoApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAnnouncementsDeleteParamDef, body) as AdminAnnouncementsDeleteParams;
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.id);

	if (announcement == null) throw noSuchAnnouncementError('ecad8040-a276-4e85-bda9-015a708d291e');

	await deleteAnnouncementWithModerationLog({
		db: deps.db,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, announcement, me);
}

export async function handleHonoApiAdminAnnouncementsList(
	deps: HonoApiAdminAnnouncementDependencies,
	body: Record<string, unknown>,
): Promise<AdminAnnouncement[]> {
	const params = parseHonoApiParams(adminAnnouncementsListParamDef, body) as AdminAnnouncementsListParams;
	const announcements = await listAnnouncementsForAdminFromDatabase(deps.db, {
		limit: params.limit,
		...resolveAnnouncementPagination({ gen: time => genId(deps.config, time) }, params),
		status: params.status,
		userId: params.userId,
	});
	const reads = await countAnnouncementReadsByAnnouncementIdsFromDatabase(deps.db, announcements.map(announcement => announcement.id));

	return announcements.map(announcement => packAdminAnnouncementForHonoApi(
		deps.config,
		announcement,
		reads.get(announcement.id) ?? 0,
	));
}

export async function handleHonoApiAdminAnnouncementsUpdate(
	deps: HonoApiAdminAnnouncementDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAnnouncementsUpdateParamDef, body) as AdminAnnouncementsUpdateParams;
	const announcement = await fetchAnnouncementByIdFromDatabase(deps.db, params.id);

	if (announcement == null) throw noSuchAnnouncementError('d3aae5a7-6372-4cb4-b61c-f511ffc2d7cc');

	await updateAnnouncementWithModerationLog({
		db: deps.db,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, announcement, {
		title: params.title,
		text: params.text,
		imageUrl: params.imageUrl || null,
		display: params.display,
		icon: params.icon,
		forExistingUsers: params.forExistingUsers,
		silence: params.silence,
		needConfirmationToRead: params.needConfirmationToRead,
		isActive: params.isActive,
	} as AnnouncementUpdateValues, me);
}
