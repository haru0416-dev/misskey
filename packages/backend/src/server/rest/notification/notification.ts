/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiUser } from '@/models/User.js';
import { pushSwNotification } from '../../../core/notification/push-notification.js';
import { parseApiParams } from '../validation.js';
import type { NotificationDependencies, AppNotification, TestNotification } from '@/core/notification/notification.js';
import { publishNotification, receivesNotification, toXListId } from '@/core/notification/notification.js';

type PackedAppNotification = {
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

export async function resolveNotificationStreamId(
	deps: Pick<NotificationDependencies, 'redis'>,
	userId: MiUser['id'],
	notificationId: string,
): Promise<string> {
	const key = `notificationTimeline:${userId}`;
	const canonicalId = toXListId(notificationId);
	if ((await deps.redis.xrange(key, canonicalId, canonicalId)).length > 0) {
		return canonicalId;
	}

	// 遅延再試行では自動生成 ID が付く場合がある。ストリームは MAXLEN 制限済みなので、
	// API 上の通知 ID を全走査しても探索量は制限内に収まる。
	const entries = await deps.redis.xrevrange(key, '+', '-');
	for (const [streamId, fields] of entries) {
		const dataIndex = fields.indexOf('data');
		const data = fields[dataIndex + 1];
		if (dataIndex === -1 || data == null) {
			continue;
		}
		try {
			if ((JSON.parse(data) as { id?: unknown }).id === notificationId) {
				return streamId;
			}
		} catch {
			// 不正な既存エントリがあっても、対象通知の探索は継続する。
		}
	}
	return canonicalId;
}

function createAppNotification(
	deps: NotificationDependencies,
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
			if (!(await receivesNotification(deps, userId, 'app'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'app',
				appAccessTokenId: data.appAccessTokenId,
				customBody: data.customBody,
				customHeader: data.customHeader,
				customIcon: data.customIcon,
			} satisfies AppNotification;
			const packed = {
				id: notification.id,
				createdAt: notification.createdAt,
				type: notification.type,
				body: notification.customBody,
				header: notification.customHeader,
				icon: notification.customIcon,
			} satisfies PackedAppNotification;
			await publishNotification(deps, userId, notification, packed);
		})(),
	);
}

function createTestNotification(deps: NotificationDependencies, userId: MiUser['id']): void {
	trackPromise(
		(async () => {
			if (!(await receivesNotification(deps, userId, 'test'))) {
				return;
			}

			const notification = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'test',
			} satisfies TestNotification;
			// テスト通知は届いたことをすぐ確かめられるよう、未読の知らせも待たずに流す。
			await publishNotification(deps, userId, notification, undefined, { delayUnread: false });
		})(),
	);
}

async function flushAllApiNotifications(deps: NotificationDependencies, userId: MiUser['id']): Promise<void> {
	await Promise.all([
		deps.redis.del(`notificationTimeline:${userId}`),
		deps.redis.del(`latestReadNotification:${userId}`),
	]);
	deps.publishMainStream?.(userId, 'notificationFlushed');
}

export async function markAllApiNotificationsAsRead(
	deps: NotificationDependencies,
	userId: MiUser['id'],
	force: boolean,
): Promise<void> {
	const latestReadNotificationId = await deps.redis.get(`latestReadNotification:${userId}`);

	const latestNotificationIdsRes = await deps.redis.xrevrange(`notificationTimeline:${userId}`, '+', '-', 'COUNT', 1);
	const latestNotificationId = latestNotificationIdsRes[0]?.[0];

	if (latestNotificationId == null) {
		return;
	}

	await deps.redis.set(`latestReadNotification:${userId}`, latestNotificationId);

	if (force || latestReadNotificationId == null || latestReadNotificationId < latestNotificationId) {
		deps.publishMainStream?.(userId, 'readAllNotifications');
		void pushSwNotification(deps, userId, 'readAllNotifications', undefined);
	}
}

export async function handleApiNotificationsCreate(
	deps: NotificationDependencies,
	me: MiUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(notificationsCreateParamDef, body);
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

export async function handleApiNotificationsDelete(
	deps: NotificationDependencies,
	me: MiUser,
	params: ApiParams<typeof notificationsDeleteParamDef>,
): Promise<void> {
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
				if (dataIndex === -1 || data == null) {
					return null;
				}
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
				while (first > 0 && notificationGroupKey(parseNotification(entries[first - 1]![1]) ?? {}) === targetKey) {
					first--;
				}
				while (
					last + 1 < entries.length &&
					notificationGroupKey(parseNotification(entries[last + 1]![1]) ?? {}) === targetKey
				) {
					last++;
				}
				idsToDelete = entries.slice(first, last + 1).map(([id]) => id);
			}
		}
	}

	if (idsToDelete.length > 0) {
		await deps.redis.xdel(streamKey, ...idsToDelete);
	}
	deps.publishMainStream?.(me.id, 'notificationFlushed');
}

export function handleApiNotificationsFlush(deps: NotificationDependencies, me: MiUser): void {
	trackPromise(flushAllApiNotifications(deps, me.id));
}

export function handleApiNotificationsMarkAllAsRead(deps: NotificationDependencies, me: MiUser): void {
	trackPromise(markAllApiNotificationsAsRead(deps, me.id, true));
}

export function handleApiNotificationsTestNotification(deps: NotificationDependencies, me: MiUser): void {
	createTestNotification(deps, me.id);
}
