/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ReplyError, type Redis } from 'ioredis';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Config } from '@/config.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseUuidv7Full } from '@/misc/id/uuidv7.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiMeta } from '@/models/_.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { userExportableEntities } from '@/types.js';
import { packHonoApiRole } from './roles.js';
import { pushSwNotificationForHonoApi } from './push-notification.js';
import type { HonoApiMainStreamPublisher } from './events.js';
import { parseHonoApiParams } from './validation.js';

export type { HonoApiMainStreamPublisher } from './events.js';

export type HonoApiNotificationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis;
	meta: Pick<MiMeta, 'enableServiceWorker' | 'swPublicKey' | 'swPrivateKey'>;
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
	achievement: (typeof ACHIEVEMENT_TYPES)[number];
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
	exportedEntity: (typeof userExportableEntities)[number];
	fileId: MiDriveFile['id'];
};

type HonoStoredNotification =
	| HonoSimpleNotification
	| RoleAssignedNotification
	| AppNotification
	| TestNotification
	| AchievementEarnedNotification
	| ScheduledNotePostedNotification
	| ScheduledNotePostFailedNotification
	| PollEndedNotification
	| ExportCompletedNotification;

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

export const notificationsCreateParamDef = z.object({
	body: z.string(),
	header: z.string().nullable().optional(),
	icon: z.string().nullable().optional(),
});

export const notificationsDeleteParamDef = z.object({
	notificationId: misskeyId(),
	grouped: z.boolean().optional().default(false),
});

type NotificationsCreateParams = {
	body: string;
	header?: string | null;
	icon?: string | null;
};

export const claimAchievementParamDef = z.object({
	name: z.enum(ACHIEVEMENT_TYPES),
});

type ClaimAchievementParams = {
	name: (typeof ACHIEVEMENT_TYPES)[number];
};

export function toXListId(id: string): string {
	const { date, additional } = parseUuidv7Full(id);
	return `${date}-${BigInt.asUintN(64, additional).toString()}`;
}

export async function resolveNotificationStreamId(
	deps: Pick<HonoApiNotificationDependencies, 'redis'>,
	userId: MiUser['id'],
	notificationId: string,
): Promise<string> {
	const key = `notificationTimeline:${userId}`;
	const canonicalId = toXListId(notificationId);
	if ((await deps.redis.xrange(key, canonicalId, canonicalId)).length > 0) return canonicalId;

	// Delayed durable retries may be appended with a generated stream ID. The stream is MAXLEN-bounded,
	// so resolving the API-visible notification ID with a bounded scan is preferable to losing deletion/pagination.
	const entries = await deps.redis.xrevrange(key, '+', '-');
	for (const [streamId, fields] of entries) {
		const dataIndex = fields.indexOf('data');
		const data = fields[dataIndex + 1];
		if (dataIndex === -1 || data == null) continue;
		try {
			if ((JSON.parse(data) as { id?: unknown }).id === notificationId) return streamId;
		} catch {
			// Ignore malformed legacy entries and continue looking for the requested notification.
		}
	}
	return canonicalId;
}

const appendNotificationWithGeneratedStreamId = `
local entries = redis.call('XRANGE', KEYS[1], '-', '+')
for _, entry in ipairs(entries) do
	local fields = entry[2]
	for index = 1, #fields, 2 do
		if fields[index] == 'data' and fields[index + 1] == ARGV[2] then
			return entry[1]
		end
	end
end
return redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[1], '*', 'data', ARGV[2])
`;

export async function xaddHonoApiNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	notification: { id: string } & Record<string, unknown>,
): Promise<string> {
	const key = `notificationTimeline:${userId}`;
	const streamId = toXListId(notification.id);
	const serialized = JSON.stringify(notification);
	try {
		return (await deps.redis.xadd(
			key,
			'MAXLEN',
			'~',
			deps.config.limits.userNotifications.toString(),
			streamId,
			'data',
			serialized,
		))!;
	} catch (err) {
		if (!(err instanceof ReplyError)) throw err;
		const existing = await deps.redis.xrange(key, streamId, streamId);
		if (existing[0]?.[1]?.[1] === serialized) return streamId;
		if (existing.length > 0) throw err;
		return String(
			await deps.redis.eval(
				appendNotificationWithGeneratedStreamId,
				1,
				key,
				deps.config.limits.userNotifications.toString(),
				serialized,
			),
		);
	}
}

export async function xaddHonoApiNotifications(
	deps: HonoApiNotificationDependencies,
	items: readonly {
		userId: MiUser['id'];
		notification: { id: string } & Record<string, unknown>;
	}[],
): Promise<void> {
	if (items.length === 0) return;

	const batchSize = 1000;
	for (let offset = 0; offset < items.length; offset += batchSize) {
		const batch = items.slice(offset, offset + batchSize);
		const pipeline = deps.redis.pipeline();
		for (const item of batch) {
			pipeline.xadd(
				`notificationTimeline:${item.userId}`,
				'MAXLEN',
				'~',
				deps.config.limits.userNotifications.toString(),
				toXListId(item.notification.id),
				'data',
				JSON.stringify(item.notification),
			);
		}
		const results = await pipeline.exec();
		if (results == null) throw new Error('Failed to append notifications');

		await Promise.all(
			results.map(([error], index) => {
				if (error == null) return Promise.resolve();
				if (error instanceof ReplyError) {
					const item = batch[index]!;
					return xaddHonoApiNotification(deps, item.userId, item.notification).then(() => undefined);
				}
				return Promise.reject(error);
			}),
		);
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
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig[type]?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type,
			} satisfies HonoSimpleNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', notification);
					})
					.catch(() => {}),
			);
		})(),
	);
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
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.roleAssigned?.type === 'never') return;

			const notification = {
				id: genId(),
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
			void pushSwNotificationForHonoApi(deps, userId, 'notification', packed);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', packed);
					})
					.catch(() => {}),
			);
		})(),
	);
}

export function createScheduledNotePostedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	noteId: string,
): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.scheduledNotePosted?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'scheduledNotePosted',
				noteId,
			} satisfies ScheduledNotePostedNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', notification);
					})
					.catch(() => {}),
			);
		})(),
	);
}

export function createScheduledNotePostFailedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	noteDraftId: string,
): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.scheduledNotePostFailed?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'scheduledNotePostFailed',
				noteDraftId,
			} satisfies ScheduledNotePostFailedNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', notification);
					})
					.catch(() => {}),
			);
		})(),
	);
}

export async function createPollEndedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	noteId: string,
	profile?: MiUserProfile,
): Promise<void> {
	const resolvedProfile = profile ?? (await fetchUserProfileByUserIdFromDatabase(deps.db, userId));
	if (resolvedProfile?.notificationRecieveConfig.pollEnded?.type === 'never') return;

	const notification = {
		id: genId(),
		createdAt: new Date().toISOString(),
		type: 'pollEnded',
		noteId,
	} satisfies PollEndedNotification;
	const redisId = await xaddNotification(deps, userId, notification);

	deps.publishMainStream?.(userId, 'notification', notification);
	void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

	trackPromise(
		delay(2000, undefined, { ref: false })
			.then(async () => {
				const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
				if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
				deps.publishMainStream?.(userId, 'unreadNotification', notification);
			})
			.catch(() => {}),
	);
}

export function createExportCompletedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	exportedEntity: (typeof userExportableEntities)[number],
	fileId: MiDriveFile['id'],
): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.exportCompleted?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'exportCompleted',
				exportedEntity,
				fileId,
			} satisfies ExportCompletedNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', notification);
					})
					.catch(() => {}),
			);
		})(),
	);
}

function createAppNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	data: {
		appAccessTokenId: string | null;
		customBody: string;
		customHeader: string | null;
		customIcon: string | null;
	},
): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.app?.type === 'never') return;

			const notification = {
				id: genId(),
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
			void pushSwNotificationForHonoApi(deps, userId, 'notification', packed);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', packed);
					})
					.catch(() => {}),
			);
		})(),
	);
}

function createTestNotification(deps: HonoApiNotificationDependencies, userId: MiUser['id']): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.test?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'test',
			} satisfies TestNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
			if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
			deps.publishMainStream?.(userId, 'unreadNotification', notification);
		})(),
	);
}

function createAchievementEarnedNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	achievement: (typeof ACHIEVEMENT_TYPES)[number],
): void {
	trackPromise(
		(async () => {
			const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
			if (profile?.notificationRecieveConfig.achievementEarned?.type === 'never') return;

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'achievementEarned',
				achievement,
			} satisfies AchievementEarnedNotification;
			const redisId = await xaddNotification(deps, userId, notification);

			deps.publishMainStream?.(userId, 'notification', notification);
			void pushSwNotificationForHonoApi(deps, userId, 'notification', notification);

			trackPromise(
				delay(2000, undefined, { ref: false })
					.then(async () => {
						const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
						if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
						deps.publishMainStream?.(userId, 'unreadNotification', notification);
					})
					.catch(() => {}),
			);
		})(),
	);
}

export async function grantAchievementForHonoApi(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	name: (typeof ACHIEVEMENT_TYPES)[number],
): Promise<void> {
	if (!(ACHIEVEMENT_TYPES as readonly string[]).includes(name)) return;

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, userId);
	if (profile == null) return;
	if (profile.achievements.some((a) => a.name === name)) return;

	await updateUserProfileInDatabase(deps.db, userId, {
		achievements: [
			...profile.achievements,
			{
				name,
				unlockedAt: Date.now(),
			},
		],
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

async function flushAllHonoApiNotifications(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
): Promise<void> {
	await Promise.all([
		deps.redis.del(`notificationTimeline:${userId}`),
		deps.redis.del(`latestReadNotification:${userId}`),
	]);
	deps.publishMainStream?.(userId, 'notificationFlushed');
}

export async function markAllHonoApiNotificationsAsRead(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	force: boolean,
): Promise<void> {
	const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);

	const latestNotificationIdsRes = await deps.redis.xrevrange(`notificationTimeline:${userId}`, '+', '-', 'COUNT', 1);
	const latestNotificationId = latestNotificationIdsRes[0]?.[0];

	if (latestNotificationId == null) return;

	await deps.redis.set(`latestReadNotification:${userId}`, latestNotificationId);

	if (force || latestReadNotificationId == null || latestReadNotificationId < latestNotificationId) {
		deps.publishMainStream?.(userId, 'readAllNotifications');
		void pushSwNotificationForHonoApi(deps, userId, 'readAllNotifications', undefined);
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

function notificationGroupKey(notification: Record<string, unknown>): string | null {
	if (notification['type'] === 'reaction' && typeof notification['noteId'] === 'string') {
		return `reaction:${notification['noteId']}`;
	}
	if (notification['type'] === 'renote' && typeof notification['targetNoteId'] === 'string') {
		return `renote:${notification['targetNoteId']}`;
	}
	return null;
}

export async function handleHonoApiNotificationsDelete(
	deps: HonoApiNotificationDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notificationsDeleteParamDef, body);
	const streamKey = `notificationTimeline:${me.id}`;
	const redisId = await resolveNotificationStreamId(deps, me.id, params.notificationId);
	let idsToDelete = [redisId];

	if (params.grouped) {
		const entries = await deps.redis.xrevrange(streamKey, '+', '-');
		const targetIndex = entries.findIndex(([id]) => id === redisId);
		if (targetIndex !== -1) {
			const parseNotification = (fields: string[]): Record<string, unknown> | null => {
				const dataIndex = fields.indexOf('data');
				const data = fields[dataIndex + 1];
				if (dataIndex === -1 || data == null) return null;
				try {
					return JSON.parse(data) as Record<string, unknown>;
				} catch {
					return null;
				}
			};
			const targetKey = notificationGroupKey(parseNotification(entries[targetIndex]![1]) ?? {});
			if (targetKey != null) {
				let first = targetIndex;
				let last = targetIndex;
				while (first > 0 && notificationGroupKey(parseNotification(entries[first - 1]![1]) ?? {}) === targetKey)
					first--;
				while (
					last + 1 < entries.length &&
					notificationGroupKey(parseNotification(entries[last + 1]![1]) ?? {}) === targetKey
				)
					last++;
				idsToDelete = entries.slice(first, last + 1).map(([id]) => id);
			}
		}
	}

	if (idsToDelete.length > 0) {
		await deps.redis.xdel(streamKey, ...idsToDelete);
	}
	deps.publishMainStream?.(me.id, 'notificationFlushed');
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
