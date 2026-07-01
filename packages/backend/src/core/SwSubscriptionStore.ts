/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq } from 'drizzle-orm';
import { swSubscription, type SwSubscriptionInsert, type SwSubscriptionRow } from '@/db/schema/sw-subscription.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiSwSubscription } from '@/models/SwSubscription.js';
import type { MiUser } from '@/models/User.js';

type SwSubscriptionUpdate = Pick<MiSwSubscription, 'auth' | 'publickey' | 'sendReadMessage'>;

export function isDuplicateKeyValueDatabaseError(error: unknown): boolean {
	let current: unknown = error;

	for (let i = 0; i < 5 && current != null && typeof current === 'object'; i++) {
		const candidate = current as {
			code?: unknown;
			cause?: unknown;
			driverError?: unknown;
		};

		if (candidate.code === '23505') {
			return true;
		}

		current = candidate.driverError ?? candidate.cause;
	}

	return false;
}

function deserializeSwSubscription(row: SwSubscriptionRow): MiSwSubscription {
	return row as MiSwSubscription;
}

function swSubscriptionByUserAndEndpointCondition(userId: MiUser['id'], endpoint: string) {
	return and(
		eq(swSubscription.userId, userId),
		eq(swSubscription.endpoint, endpoint),
	);
}

export async function fetchSwSubscriptionFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	endpoint: string,
): Promise<MiSwSubscription | null> {
	const [row] = await db
		.select()
		.from(swSubscription)
		.where(swSubscriptionByUserAndEndpointCondition(userId, endpoint))
		.limit(1);

	return row ? deserializeSwSubscription(row) : null;
}

export async function listSwSubscriptionsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiSwSubscription[]> {
	const rows = await db
		.select()
		.from(swSubscription)
		.where(eq(swSubscription.userId, userId));

	return rows.map(deserializeSwSubscription);
}

export async function createSwSubscriptionInDatabase(
	db: MiDrizzleDatabase,
	data: SwSubscriptionInsert,
): Promise<void> {
	await db
		.insert(swSubscription)
		.values(data);
}

export async function updateSwSubscriptionInDatabase(
	db: MiDrizzleDatabase,
	id: MiSwSubscription['id'],
	data: Partial<SwSubscriptionUpdate>,
): Promise<void> {
	await db
		.update(swSubscription)
		.set(data)
		.where(eq(swSubscription.id, id));
}

export async function updateSwSubscriptionByUserAndEndpointInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	endpoint: string,
	data: Partial<SwSubscriptionUpdate>,
): Promise<void> {
	await db
		.update(swSubscription)
		.set(data)
		.where(swSubscriptionByUserAndEndpointCondition(userId, endpoint));
}

export async function deleteSwSubscriptionByEndpointFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'] | null,
	endpoint: string,
): Promise<void> {
	await db
		.delete(swSubscription)
		.where(userId == null
			? eq(swSubscription.endpoint, endpoint)
			: swSubscriptionByUserAndEndpointCondition(userId, endpoint));
}

export async function deleteSwSubscriptionForPushEndpointFromDatabase(
	db: MiDrizzleDatabase,
	params: Pick<MiSwSubscription, 'userId' | 'endpoint' | 'auth' | 'publickey'>,
): Promise<void> {
	await db
		.delete(swSubscription)
		.where(and(
			eq(swSubscription.userId, params.userId),
			eq(swSubscription.endpoint, params.endpoint),
			eq(swSubscription.auth, params.auth),
			eq(swSubscription.publickey, params.publickey),
		));
}
