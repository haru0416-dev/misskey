/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const queueOutbox = pgTable('queue_outbox', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	queue: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 128 }).notNull(),
	data: jsonb().notNull(),
	opts: jsonb().notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, table => [
	index('IDX_QUEUE_OUTBOX_CREATED_AT').on(table.createdAt),
]);

export type QueueOutboxRow = typeof queueOutbox.$inferSelect;
export type QueueOutboxInsert = typeof queueOutbox.$inferInsert;
