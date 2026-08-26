/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { systemWebhook, deserializeSystemWebhook, type SystemWebhookInsert } from '@/db/schema/system-webhook.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';

type SystemWebhookUpdate = Partial<
	Pick<
		SystemWebhookInsert,
		'isActive' | 'updatedAt' | 'latestSentAt' | 'latestStatus' | 'name' | 'on' | 'url' | 'secret'
	>
>;

function systemWebhookFilterCondition(options: {
	ids?: MiSystemWebhook['id'][];
	isActive?: MiSystemWebhook['isActive'];
	on?: SystemWebhookEventType[];
}): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.ids != null && options.ids.length > 0) {
		conditions.push(inArray(systemWebhook.id, options.ids));
	}

	if (options.isActive !== undefined) {
		conditions.push(eq(systemWebhook.isActive, options.isActive));
	}

	if (options.on != null && options.on.length > 0) {
		conditions.push(
			sql`ARRAY[${sql.join(
				options.on.map((type) => sql`${type}`),
				sql`, `,
			)}]::varchar[] <@ ${systemWebhook.on}`,
		);
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function fetchSystemWebhookByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiSystemWebhook['id'],
): Promise<MiSystemWebhook | null> {
	const [row] = await db.select().from(systemWebhook).where(eq(systemWebhook.id, id)).limit(1);

	return row == null ? null : deserializeSystemWebhook(row);
}

export async function fetchSystemWebhookByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiSystemWebhook['id'],
): Promise<MiSystemWebhook> {
	const webhook = await fetchSystemWebhookByIdFromDatabase(db, id);
	if (webhook == null) {
		throw new Error(`System webhook ${id} not found`);
	}

	return webhook;
}

export async function listSystemWebhooksFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		ids?: MiSystemWebhook['id'][];
		isActive?: MiSystemWebhook['isActive'];
		on?: SystemWebhookEventType[];
	} = {},
): Promise<MiSystemWebhook[]> {
	const rows = await db.select().from(systemWebhook).where(systemWebhookFilterCondition(options));

	return rows.map((row) => deserializeSystemWebhook(row));
}

export async function createSystemWebhookInDatabase(
	db: MiDrizzleDatabase,
	data: SystemWebhookInsert,
): Promise<MiSystemWebhook> {
	const [row] = await db.insert(systemWebhook).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create system webhook');
	}

	return deserializeSystemWebhook(row);
}

export async function updateSystemWebhookInDatabase(
	db: MiDrizzleDatabase,
	id: MiSystemWebhook['id'],
	data: SystemWebhookUpdate,
): Promise<MiSystemWebhook | null> {
	const [row] = await db.update(systemWebhook).set(data).where(eq(systemWebhook.id, id)).returning();

	return row == null ? null : deserializeSystemWebhook(row);
}

export async function deleteSystemWebhookFromDatabase(db: MiDrizzleDatabase, id: MiSystemWebhook['id']): Promise<void> {
	await db.delete(systemWebhook).where(eq(systemWebhook.id, id));
}
