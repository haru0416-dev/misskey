/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ReplyError, type Redis } from 'ioredis';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from '@/config.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseAidFull } from '@/misc/id/aid.js';
import { parseAidxFull } from '@/misc/id/aidx.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseMeidFull } from '@/misc/id/meid.js';
import { parseMeidgFull } from '@/misc/id/meidg.js';
import { parseObjectIdFull } from '@/misc/id/object-id.js';
import { parseUlidFull } from '@/misc/id/ulid.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiUser } from '@/models/User.js';
import type { HonoApiMainStreamPublisher } from './hono-api-events.js';

export type { HonoApiMainStreamPublisher } from './hono-api-events.js';

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

function parseIdFull(config: Config, id: string): { date: number; additional: bigint } {
	switch (config.id.toLowerCase()) {
		case 'aid': return parseAidFull(id);
		case 'aidx': return parseAidxFull(id);
		case 'objectid': return parseObjectIdFull(id);
		case 'meid': return parseMeidFull(id);
		case 'meidg': return parseMeidgFull(id);
		case 'ulid': return parseUlidFull(id);
		default: throw new Error('unrecognized id generation method');
	}
}

function toXListId(config: Config, id: string): string {
	const { date, additional } = parseIdFull(config, id);
	return `${date}-${BigInt.asUintN(64, additional).toString()}`;
}

async function xaddNotification(
	deps: HonoApiNotificationDependencies,
	userId: MiUser['id'],
	notification: HonoSimpleNotification,
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
