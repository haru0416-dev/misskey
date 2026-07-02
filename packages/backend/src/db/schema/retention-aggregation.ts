/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const retentionAggregation = pgTable('retention_aggregation', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	dateKey: varchar({ length: 512 }).notNull(),
	userIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	usersCount: integer().notNull(),
	data: jsonb().$type<Record<string, number>>().default({}).notNull(),
}, table => [
	index('IDX_09f4e5b9e4a2f268d3e284e4b3').on(table.createdAt),
	uniqueIndex('IDX_f7c3576b37bd2eec966ae24477').on(table.dateKey),
]);

export type RetentionAggregationRow = typeof retentionAggregation.$inferSelect;
export type RetentionAggregationInsert = typeof retentionAggregation.$inferInsert;
