/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiRegistryItem } from '@/models/RegistryItem.js';
import type { MiUser } from '@/models/User.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const registryItem = pgTable('registry_item', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	key: varchar({ length: 1024 }).notNull(),
	value: jsonb().$type<MiRegistryItem['value']>().default({}),
	scope: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
	domain: varchar({ length: 512 }),
}, table => [
	index('IDX_fb9d21ba0abb83223263df6bcb').on(table.userId),
	index('IDX_22baca135bb8a3ea1a83d13df3').on(table.scope),
	index('IDX_0a72bdfcdb97c0eca11fe7ecad').on(table.domain),
]);

export type RegistryItemRow = typeof registryItem.$inferSelect;
export type RegistryItemInsert = typeof registryItem.$inferInsert;
