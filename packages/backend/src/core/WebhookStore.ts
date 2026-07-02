/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { webhook, deserializeWebhook, type WebhookInsert } from '@/db/schema/webhook.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { MiUser } from '@/models/User.js';

type WebhookUpdate = Partial<Pick<
	WebhookInsert,
	| 'name'
	| 'url'
	| 'secret'
	| 'on'
	| 'active'
	| 'latestSentAt'
	| 'latestStatus'
>>;

function webhookFilterCondition(options: {
	ids?: MiWebhook['id'][];
	isActive?: MiWebhook['active'];
	on?: WebhookEventTypes[];
}): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.ids != null && options.ids.length > 0) {
		conditions.push(inArray(webhook.id, options.ids));
	}

	if (options.isActive !== undefined) {
		conditions.push(eq(webhook.active, options.isActive));
	}

	if (options.on != null && options.on.length > 0) {
		conditions.push(sql`ARRAY[${sql.join(options.on.map(type => sql`${type}`), sql`, `)}]::varchar[] <@ ${webhook.on}`);
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

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
 * UserWebhookService.getActiveWebhooks / fetchWebhooks 向け。
 * ids/isActive/on によるフィルタを掛けて一覧を返す (フィルタなしなら全件)。
 */
export async function listWebhooksFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		ids?: MiWebhook['id'][];
		isActive?: MiWebhook['active'];
		on?: WebhookEventTypes[];
	} = {},
): Promise<MiWebhook[]> {
	const rows = await db
		.select()
		.from(webhook)
		.where(webhookFilterCondition(options));

	return rows.map(row => deserializeWebhook(row));
}

export async function listWebhooksByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiWebhook[]> {
	const rows = await db
		.select()
		.from(webhook)
		.where(eq(webhook.userId, userId));

	return rows.map(row => deserializeWebhook(row));
}

export async function countWebhooksByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(webhook)
		.where(eq(webhook.userId, userId));

	return row?.count ?? 0;
}

export async function createWebhookInDatabase(
	db: MiDrizzleDatabase,
	data: WebhookInsert,
): Promise<MiWebhook> {
	const [row] = await db
		.insert(webhook)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create webhook');
	}

	return deserializeWebhook(row);
}

export async function updateWebhookInDatabase(
	db: MiDrizzleDatabase,
	id: MiWebhook['id'],
	data: WebhookUpdate,
): Promise<MiWebhook | null> {
	const [row] = await db
		.update(webhook)
		.set(data)
		.where(eq(webhook.id, id))
		.returning();

	return row == null ? null : deserializeWebhook(row);
}

export async function deleteWebhookFromDatabase(
	db: MiDrizzleDatabase,
	id: MiWebhook['id'],
): Promise<void> {
	await db
		.delete(webhook)
		.where(eq(webhook.id, id));
}
