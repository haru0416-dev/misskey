/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const systemWebhook = pgTable('system_webhook', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	isActive: boolean().default(true).notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	latestSentAt: timestamp({ withTimezone: true }),
	latestStatus: integer(),
	name: varchar({ length: 255 }).notNull(),
	on: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull().$type<SystemWebhookEventType[]>(),
	url: varchar({ length: 1024 }).notNull(),
	secret: varchar({ length: 1024 }).notNull(),
}, table => [
	index('IDX_system_webhook_isActive').on(table.isActive),
	index('IDX_system_webhook_on').using('gin', table.on),
]);

export type SystemWebhookRow = typeof systemWebhook.$inferSelect;
export type SystemWebhookInsert = typeof systemWebhook.$inferInsert;

export function deserializeSystemWebhook(row: SystemWebhookRow): MiSystemWebhook {
	return row as MiSystemWebhook;
}
