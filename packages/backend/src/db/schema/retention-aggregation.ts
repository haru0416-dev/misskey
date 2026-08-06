/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const retentionAggregation = pgTable(
	'retention_aggregation',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull(),
		updatedAt: timestamp({ withTimezone: true }).notNull(),
		dateKey: varchar({ length: 512 }).notNull(),
		userIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
		usersCount: integer().notNull(),
		data: jsonb().$type<Record<string, number>>().default({}).notNull(),
	},
	(table) => [
		index('IDX_RETENTION_AGGREGATION_CREATED_AT').on(table.createdAt),
		uniqueIndex('IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE').on(table.dateKey),
	],
);

export type RetentionAggregationRow = typeof retentionAggregation.$inferSelect;
export type RetentionAggregationInsert = typeof retentionAggregation.$inferInsert;
