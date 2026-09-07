/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { webhook, deserializeWebhook } from '@/db/schema/webhook.js';
import type { WebhookInsert } from '@/db/schema/webhook.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { acquireAdvisoryTransactionLockInDatabase } from '@/misc/db-advisory-lock.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { MiUser } from '@/models/User.js';

type WebhookUpdate = Partial<
	Pick<WebhookInsert, 'name' | 'url' | 'secret' | 'on' | 'active' | 'latestSentAt' | 'latestStatus'>
>;

export async function fetchWebhookByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiWebhook['id'],
	userId: MiUser['id'],
): Promise<MiWebhook | null> {
	const [row] = await db
		.select()
		.from(webhook)
		.where(and(eq(webhook.id, id), eq(webhook.userId, userId)))
		.limit(1);

	return row == null ? null : deserializeWebhook(row);
}

/**
 * イベント発火時の配信先取得 (ノート投稿・フォロー等の都度呼ばれる) 向け。
 * userId・active・on を全部条件にする固定形。
 */
export async function listActiveWebhooksByUserIdAndEventFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	event: WebhookEventTypes,
): Promise<MiWebhook[]> {
	const statement = preparedQueryFor(db, 'webhook:activeByUserIdAndEvent', () =>
		db
			.select()
			.from(webhook)
			.where(
				and(
					eq(webhook.userId, sql.placeholder('userId')),
					eq(webhook.active, true),
					sql`ARRAY[${sql.placeholder('event')}]::varchar[] <@ ${webhook.on}`,
				),
			)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId, event });

	return rows.map((row) => deserializeWebhook(row));
}

export async function listWebhooksByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiWebhook[]> {
	const rows = await db.select().from(webhook).where(eq(webhook.userId, userId));

	return rows.map((row) => deserializeWebhook(row));
}

export async function countWebhooksByUserIdFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<number> {
	const [row] = await db.select({ count: count() }).from(webhook).where(eq(webhook.userId, userId));

	return row?.count ?? 0;
}

export async function createWebhookInDatabase(db: MiDrizzleDatabase, data: WebhookInsert): Promise<MiWebhook> {
	const [row] = await db.insert(webhook).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create webhook');
	}

	return deserializeWebhook(row);
}

export async function createWebhookWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	data: WebhookInsert,
	limit: number,
): Promise<MiWebhook | null> {
	return await db.transaction(async (tx) => {
		await acquireAdvisoryTransactionLockInDatabase(tx, 'webhook-limit', data.userId);
		if ((await countWebhooksByUserIdFromDatabase(tx, data.userId)) >= limit) {
			return null;
		}

		const [row] = await tx.insert(webhook).values(data).returning();
		if (row == null) {
			throw new Error('Failed to create webhook');
		}
		return deserializeWebhook(row);
	});
}

export async function updateWebhookInDatabase(
	db: MiDrizzleDatabase,
	id: MiWebhook['id'],
	data: WebhookUpdate,
): Promise<MiWebhook | null> {
	const [row] = await db.update(webhook).set(data).where(eq(webhook.id, id)).returning();

	return row == null ? null : deserializeWebhook(row);
}

export async function deleteWebhookFromDatabase(db: MiDrizzleDatabase, id: MiWebhook['id']): Promise<void> {
	await db.delete(webhook).where(eq(webhook.id, id));
}
