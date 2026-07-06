/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ReplyError, type Redis } from 'ioredis';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from '@/config.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseAidFull } from '@/misc/id/aid.js';
import { parseAidxFull } from '@/misc/id/aidx.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseMeidFull } from '@/misc/id/meid.js';
import { parseMeidgFull } from '@/misc/id/meidg.js';
import { parseObjectIdFull } from '@/misc/id/object-id.js';
import { parseUlidFull } from '@/misc/id/ulid.js';
import { parseUuidv7Full } from '@/misc/id/uuidv7.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { userExportableEntities } from '@/types.js';
import { packHonoApiRole } from './roles.js';
import type { HonoApiMainStreamPublisher } from './events.js';
import { parseHonoApiParams } from './validation.js';

export type { HonoApiMainStreamPublisher } from './events.js';

export type HonoApiNotificationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis;
	publishMainStream?: HonoApiMainStreamPublisher;
};

type CreateTokenNotification = {
	id: string;
	createdAt: string;
	type: 'createToken';
};

type LoginNotification = {
	id: string;
	createdAt: string;
	type: 'login';
};

type HonoSimpleNotification = CreateTokenNotification | LoginNotification;

type RoleAssignedNotification = {
	id: string;
	createdAt: string;
	type: 'roleAssigned';
	roleId: string;
};

type AppNotification = {
	id: string;
	createdAt: string;
	type: 'app';
	appAccessTokenId: string | null;
	customBody: string;
	customHeader: string | null;
	customIcon: string | null;
};

type TestNotification = {
	id: string;
	createdAt: string;
	type: 'test';
};

type AchievementEarnedNotification = {
	id: string;
	createdAt: string;
	type: 'achievementEarned';
	achievement: typeof ACHIEVEMENT_TYPES[number];
};

type ScheduledNotePostedNotification = {
	id: string;
	createdAt: string;
	type: 'scheduledNotePosted';
	noteId: string;
};

type ScheduledNotePostFailedNotification = {
	id: string;
	createdAt: string;
	type: 'scheduledNotePostFailed';
	noteDraftId: string;
};

type PollEndedNotification = {
	id: string;
	createdAt: string;
	type: 'pollEnded';
	noteId: string;
};

type ExportCompletedNotification = {
	id: string;
	createdAt: string;
	type: 'exportCompleted';
	exportedEntity: typeof userExportableEntities[number];
	fileId: MiDriveFile['id'];
};

type HonoStoredNotification = HonoSimpleNotification | RoleAssignedNotification | AppNotification | TestNotification | AchievementEarnedNotification | ScheduledNotePostedNotification | ScheduledNotePostFailedNotification | PollEndedNotification | ExportCompletedNotification;

type HonoPackedRoleAssignedNotification = {
	id: string;
	createdAt: string;
	type: 'roleAssigned';
	role: Packed<'Role'>;
};

type HonoPackedAppNotification = {
	id: string;
	createdAt: string;
	type: 'app';
	body: string;
	header: string | null;
	icon: string | null;
};

const notificationsCreateParamDef = {
	type: 'object',
	properties: {
		body: { type: 'string' },
		header: { type: 'string', nullable: true },
		icon: { type: 'string', nullable: true },
	},
	required: ['body'],
} as const;

type NotificationsCreateParams = {
	body: string;
	header?: string | null;
	icon?: string | null;
};

const claimAchievementParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', enum: ACHIEVEMENT_TYPES },
	},
	required: ['name'],
} as const;

type ClaimAchievementParams = {
	name: typeof ACHIEVEMENT_TYPES[number];
};

function parseIdFull(config: Config, id: string): { date: number; additional: bigint } {
	switch (config.id.toLowerCase()) {
		case 'aid': return parseAidFull(id);
		case 'aidx': return parseAidxFull(id);
		case 'objectid': return parseObjectIdFull(id);
		case 'meid': return parseMeidFull(id);
		case 'meidg': return parseMeidgFull(id);
		case 'ulid': return parseUlidFull(id);
		case 'uuidv7': return parseUuidv7Full(id);
		default: throw new Error('unrecognized id generation method');
	}
}

export function toXListId(config: Config, id: string): string {
	const { date, additional } = parseIdFull(config, id);
	return `${date}-${BigInt.asUintN(64, additional).toString()}`;
}

export async function xaddHonoApiNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	notification: { id: string } & Record<string, unknown>,
): Promise<string> {
	while (true) {
		try {
			return (await deps.redis.xadd(
				`notificationTimeline:${userId}`,
				'MAXLEN', '~', deps.config.perUserNotificationsMaxCount.toString(),
				toXListId(deps.config, notification.id),
				'data', JSON.stringify(notification),
			))!;
		} catch (err) {
			if (err instanceof ReplyError) continue;
			throw err;
		}
	}
}

async function xaddNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	notification: HonoStoredNotification,
): Promise<string> {
	return await xaddHonoApiNotification(deps, userId, notification);
}

function createSimpleNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	type: HonoSimpleNotification['type'],
): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig[type]?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type,
		} satisfies HonoSimpleNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export function createTokenNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id']): void {
	createSimpleNotification(deps, userId, 'createToken');
}

export function createLoginNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id']): void {
	createSimpleNotification(deps, userId, 'login');
}

export function createRoleAssignedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	role: MiRole,
): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.roleAssigned?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'roleAssigned',
			roleId: role.id,
		} satisfies RoleAssignedNotification;
		const redisId = await xaddNotification(deps, userId, notification);
		const packed = {
			id: notification.id,
			createdAt: notification.createdAt,
			type: notification.type,
			role: await packHonoApiRole(deps, role),
		} satisfies HonoPackedRoleAssignedNotification;

		deps.publishMainStream?.(userId, 'notification', packed);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', packed);
		}).catch(() => {}));
	})());
}

export function createScheduledNotePostedNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id'], noteId: string): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.scheduledNotePosted?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'scheduledNotePosted',
			noteId,
		} satisfies ScheduledNotePostedNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export function createScheduledNotePostFailedNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id'], noteDraftId: string): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.scheduledNotePostFailed?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'scheduledNotePostFailed',
			noteDraftId,
		} satisfies ScheduledNotePostFailedNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export function createPollEndedNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id'], noteId: string): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.pollEnded?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'pollEnded',
			noteId,
		} satisfies PollEndedNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export function createExportCompletedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	exportedEntity: typeof userExportableEntities[number],
	fileId: MiDriveFile['id'],
): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.exportCompleted?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'exportCompleted',
			exportedEntity,
			fileId,
		} satisfies ExportCompletedNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export function createAppNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	data: {
		appAccessTokenId: string | null;
		customBody: string;
		customHeader: string | null;
		customIcon: string | null;
	},
): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.app?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'app',
			appAccessTokenId: data.appAccessTokenId,
			customBody: data.customBody,
			customHeader: data.customHeader,
			customIcon: data.customIcon,
		} satisfies AppNotification;
		const redisId = await xaddNotification(deps, userId, notification);
		const packed = {
			id: notification.id,
			createdAt: notification.createdAt,
			type: notification.type,
			body: notification.customBody,
			header: notification.customHeader,
			icon: notification.customIcon,
		} satisfies HonoPackedAppNotification;

		deps.publishMainStream?.(userId, 'notification', packed);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', packed);
		}).catch(() => {}));
	})());
}

export function createTestNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id']): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.test?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'test',
		} satisfies TestNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
		if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
		deps.publishMainStream?.(userId, 'unreadNotification', notification);
	})());
}

function createAchievementEarnedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	achievement: typeof ACHIEVEMENT_TYPES[number],
): void {
	trackPromise((async () => {
		const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
		if (profile?.notificationRecieveConfig.achievementEarned?.type === 'never') return;

		const notification = {
			id: genId(deps.config),
			createdAt: new Date().toISOString(),
			type: 'achievementEarned',
			achievement,
		} satisfies AchievementEarnedNotification;
		const redisId = await xaddNotification(deps, userId, notification);

		deps.publishMainStream?.(userId, 'notification', notification);

		trackPromise(delay(2000, undefined, { ref: false }).then(async () => {
			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		}).catch(() => {}));
	})());
}

export async function grantAchievementForHonoApi(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	name: typeof ACHIEVEMENT_TYPES[number],
): Promise<void> {
	if (!(ACHIEVEMENT_TYPES as readonly string[]).includes(name)) return;

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
	if (profile == null) return;
	if (profile.achievements.some(a => a.name === name)) return;

	await updateUserProfileInDatabase(deps.db, userId, {
		achievements: [...profile.achievements, {
			name,
			unlockedAt: Date.now(),
		}],
	});

	createAchievementEarnedNotification(deps, userId, name);
}

export async function handleHonoApiIClaimAchievement(
	deps: HonoApiNotificationDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(claimAchievementParamDef, body);
	await grantAchievementForHonoApi(deps, me.id, params.name);
}

async function flushAllHonoApiNotifications(deps: HonoApiNotificationDependencies, userId: MiUser['id']): Promise<void> {
	await Promise.all([
		deps.redis.del(`notificationTimeline:${userId}`),
		deps.redis.del(`latestReadNotification:${userId}`),
	]);
	deps.publishMainStream?.(userId, 'notificationFlushed');
}

export async function markAllHonoApiNotificationsAsRead(deps: HonoApiNotificationDependencies, userId: MiUser['id'], force: boolean): Promise<void> {
	const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);

	const latestNotificationIdsRes = await deps.redis.xrevrange(`notificationTimeline:${userId}`, '+', '-', 'COUNT', 1);
	const latestNotificationId = latestNotificationIdsRes[0]?.[0];

	if (latestNotificationId == null) return;

	await deps.redis.set(`latestReadNotification:${userId}`, latestNotificationId);

	if (force || latestReadNotificationId == null || latestReadNotificationId < latestNotificationId) {
		deps.publishMainStream?.(userId, 'readAllNotifications');
	}
}

export async function handleHonoApiNotificationsCreate(
	deps: HonoApiNotificationDependencies,
	me: MiUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notificationsCreateParamDef, body);
	createAppNotification(deps, me.id, {
		appAccessTokenId: token ? token.id : null,
		customBody: params.body,
		customHeader: params.header ?? token?.name ?? null,
		customIcon: params.icon ?? token?.iconUrl ?? null,
	});
}

export function handleHonoApiNotificationsFlush(deps: HonoApiNotificationDependencies, me: MiUser): void {
	trackPromise(flushAllHonoApiNotifications(deps, me.id));
}

export function handleHonoApiNotificationsMarkAllAsRead(deps: HonoApiNotificationDependencies, me: MiUser): void {
	trackPromise(markAllHonoApiNotificationsAsRead(deps, me.id, true));
}

export function handleHonoApiNotificationsTestNotification(deps: HonoApiNotificationDependencies, me: MiUser): void {
	createTestNotification(deps, me.id);
}
