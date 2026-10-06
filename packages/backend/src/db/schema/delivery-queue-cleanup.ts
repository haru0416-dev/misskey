/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const deliveryQueueCleanup = pgTable(
	'delivery_queue_cleanup',
	{
		jobId: varchar({ length: 128 }).primaryKey().notNull(),
		availableAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
		leaseToken: varchar({ length: 64 }),
		leaseExpiresAt: timestamp({ withTimezone: true }),
		attempts: integer().default(0).notNull(),
		lastError: text(),
		createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('IDX_DELIVERY_QUEUE_CLEANUP_AVAILABLE_AT').on(table.availableAt, table.createdAt, table.jobId),
		index('IDX_DELIVERY_QUEUE_CLEANUP_LEASE_EXPIRES_AT').on(table.leaseExpiresAt),
	],
);

export type DeliveryQueueCleanupRow = typeof deliveryQueueCleanup.$inferSelect;
export type DeliveryQueueCleanupInsert = typeof deliveryQueueCleanup.$inferInsert;
