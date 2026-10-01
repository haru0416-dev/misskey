/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ReplyError } from 'ioredis';
import type { Redis } from 'ioredis';
import type { Config } from '@/config.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseUuidv7Full } from '@/misc/id/uuidv7.js';
import { trackPromise, unrefDelay } from '@/misc/promise-tracker.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { userExportableEntities } from '@/types.js';
import { packRole } from '../role/role-packing.js';
import { pushSwNotification } from './push-notification.js';
import type { PushNotificationDependencies, PushNotificationsTypes } from './push-notification.js';
import type { MainStreamPublisher } from '../events.js';

export type { MainStreamPublisher } from '../events.js';

export type NotificationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis;
	meta: Pick<MiMeta, 'enableServiceWorker' | 'swPublicKey' | 'swPrivateKey'>;
	httpRequestService: PushNotificationDependencies['httpRequestService'];
	publishMainStream?: MainStreamPublisher;
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

type SimpleNotification = CreateTokenNotification | LoginNotification;

type RoleAssignedNotification = {
	id: string;
	createdAt: string;
	type: 'roleAssigned';
	roleId: string;
};

export type AppNotification = {
	id: string;
	createdAt: string;
	type: 'app';
	appAccessTokenId: string | null;
	customBody: string;
	customHeader: string | null;
	customIcon: string | null;
};

export type TestNotification = {
	id: string;
	createdAt: string;
	type: 'test';
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

type StoredNotification =
	| SimpleNotification
	| RoleAssignedNotification
	| AppNotification
	| TestNotification
	| ScheduledNotePostedNotification
	| ScheduledNotePostFailedNotification
	| PollEndedNotification
	| ExportCompletedNotification;

type PackedRoleAssignedNotification = {
	id: string;
	createdAt: string;
	type: 'roleAssigned';
	role: Packed<'Role'>;
};

export function toXListId(id: string): string {
	const { date, additional } = parseUuidv7Full(id);
	return `${date}-${BigInt.asUintN(64, additional).toString()}`;
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

export async function xaddNotification(
	deps: NotificationDependencies,
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
		if (!(err instanceof ReplyError)) {
			throw err;
		}
		const existing = await deps.redis.xrange(key, streamId, streamId);
		if (existing[0]?.[1]?.[1] === serialized) {
			return streamId;
		}
		if (existing.length > 0) {
			throw err;
		}
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

export async function xaddNotifications(
	deps: NotificationDependencies,
	items: readonly {
		userId: MiUser['id'];
		notification: { id: string } & Record<string, unknown>;
	}[],
): Promise<void> {
	if (items.length === 0) {
		return;
	}

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
		if (results == null) {
			throw new Error('Failed to append notifications');
		}

		await Promise.all(
			results.map(async ([error], index) => {
				if (error == null) {
					return;
				}
				if (error instanceof ReplyError) {
					const item = batch[index]!;
					await xaddNotification(deps, item.userId, item.notification);
					return;
				}
				throw error;
			}),
		);
	}
}

type NotificationReceiveType = keyof MiUserProfile['notificationRecieveConfig'];

export async function receivesNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	type: NotificationReceiveType,
	profile?: MiUserProfile | null,
): Promise<boolean> {
	const resolved = profile ?? (await fetchUserProfileByUserIdFromDatabase(deps.db, userId));
	return resolved?.notificationRecieveConfig[type]?.type !== 'never';
}

/**
 * 既読にならないまま 2 秒たてば未読の知らせ (unreadNotification) を流す。クライアントの未読数のバッジはこれで増える。
 * redisId は通知を保存したストリームの ID。
 */
export function scheduleUnreadNotification(
	deps: Pick<NotificationDependencies, 'redis' | 'publishMainStream'>,
	userId: MiUser['id'],
	redisId: string,
	packed: unknown,
): void {
	trackPromise(
		unrefDelay(2000)
			.then(async () => {
				const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
				if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
				deps.publishMainStream?.(userId, 'unreadNotification', packed);
			})
			.catch(() => {}),
	);
}

/**
 * 保存して配信と Push 送信をし、既読にならないまま 2 秒たてば未読の知らせを流す。
 * packed は配信用の形 (保存する形と違う種類だけ渡す)。
 */
export async function publishNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	notification: StoredNotification,
	packed: PushNotificationsTypes['notification'] = notification as PushNotificationsTypes['notification'],
	options: { delayUnread?: boolean } = {},
): Promise<void> {
	const redisId = await xaddNotification(deps, userId, notification);
	deps.publishMainStream?.(userId, 'notification', packed);
	void pushSwNotification(deps, userId, 'notification', packed);
	if (options.delayUnread === false) {
		const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);
		if (latestReadNotificationId && latestReadNotificationId >= redisId) return;
		deps.publishMainStream?.(userId, 'unreadNotification', packed);
		return;
	}
	scheduleUnreadNotification(deps, userId, redisId, packed);
}

function createSimpleNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	type: SimpleNotification['type'],
): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, type))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type,
			} satisfies SimpleNotification;
			await publishNotification(deps, userId, notification);
		})(),
	);
}

export function createTokenNotification(deps: NotificationDependencies, userId: MiUser['id']): void {
	createSimpleNotification(deps, userId, 'createToken');
}

export function createLoginNotification(deps: NotificationDependencies, userId: MiUser['id']): void {
	createSimpleNotification(deps, userId, 'login');
}

export function createRoleAssignedNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	role: MiRole,
): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, 'roleAssigned'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'roleAssigned',
				roleId: role.id,
			} satisfies RoleAssignedNotification;
			const packed = {
				id: notification.id,
				createdAt: notification.createdAt,
				type: notification.type,
				role: await packRole(deps, role),
			} satisfies PackedRoleAssignedNotification;
			await publishNotification(deps, userId, notification, packed);
		})(),
	);
}

export function createScheduledNotePostedNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	noteId: string,
): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, 'scheduledNotePosted'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'scheduledNotePosted',
				noteId,
			} satisfies ScheduledNotePostedNotification;
			await publishNotification(deps, userId, notification);
		})(),
	);
}

export function createScheduledNotePostFailedNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	noteDraftId: string,
): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, 'scheduledNotePostFailed'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'scheduledNotePostFailed',
				noteDraftId,
			} satisfies ScheduledNotePostFailedNotification;
			await publishNotification(deps, userId, notification);
		})(),
	);
}

export async function createPollEndedNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	noteId: string,
	profile?: MiUserProfile,
): Promise<void> {
	if (!(await receivesNotification(deps, userId, 'pollEnded', profile))) {
		return;
	}

	const notification = {
		id: genId(),
		createdAt: new Date().toISOString(),
		type: 'pollEnded',
		noteId,
	} satisfies PollEndedNotification;
	await publishNotification(deps, userId, notification);
}

export function createExportCompletedNotification(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	exportedEntity: (typeof userExportableEntities)[number],
	fileId: MiDriveFile['id'],
): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, 'exportCompleted'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'exportCompleted',
				exportedEntity,
				fileId,
			} satisfies ExportCompletedNotification;
			await publishNotification(deps, userId, notification);
		})(),
	);
}
