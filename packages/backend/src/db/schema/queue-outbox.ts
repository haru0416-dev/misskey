/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const queueOutboxStates = ['ready', 'publishing', 'published', 'reconciling', 'deadLetter'] as const;
export type QueueOutboxState = typeof queueOutboxStates[number];

export const queueOutboxKinds = ['job', 'accountDeleteCoordinator'] as const;
export type QueueOutboxKind = typeof queueOutboxKinds[number];

export const queueOutboxDeadLetterReasons = ['deliveryFailed', 'invalidPayload'] as const;
export type QueueOutboxDeadLetterReason = typeof queueOutboxDeadLetterReasons[number];

export type QueueOutboxLastError = {
	message: string;
	attemptsMade?: number;
	stacktrace?: string[];
};

export const queueOutbox = pgTable('queue_outbox', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	queue: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 128 }).notNull(),
	kind: varchar({ length: 32 }).default('job').notNull().$type<QueueOutboxKind>(),
	state: varchar({ length: 32 }).default('ready').notNull().$type<QueueOutboxState>(),
	coordinatorId: varchar({ length: 32 }).references((): AnyPgColumn => queueOutbox.id, { onDelete: 'restrict' }),
	data: jsonb().notNull(),
	opts: jsonb().notNull(),
	externalJobId: varchar({ length: 128 }),
	availableAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	leaseToken: varchar({ length: 64 }),
	leaseExpiresAt: timestamp({ withTimezone: true }),
	pollIntervalMs: integer().default(1000).notNull(),
	deadLetterReason: varchar({ length: 32 }).$type<QueueOutboxDeadLetterReason>(),
	lastError: jsonb().$type<QueueOutboxLastError>(),
	revision: integer().default(0).notNull(),
	createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, table => [
	index('IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT').on(table.state, table.availableAt, table.createdAt),
	index('IDX_QUEUE_OUTBOX_COORDINATOR_ID').on(table.coordinatorId),
	// デッドレター一覧の `state = 'deadLetter' AND id < :cursor ORDER BY id DESC` 用。
	// updatedAt 順の索引は retry/abandon で並びが変わりページングできないため使わなくなった
	index('IDX_QUEUE_OUTBOX_STATE_ID').on(table.state, table.id),
]);

export type QueueOutboxRow = typeof queueOutbox.$inferSelect;
export type QueueOutboxInsert = typeof queueOutbox.$inferInsert;
