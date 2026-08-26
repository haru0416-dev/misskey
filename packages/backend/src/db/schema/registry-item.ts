/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import type { MiRegistryItem } from '@/models/RegistryItem.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const registryItem = pgTable(
	'registry_item',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		updatedAt: timestamp({ withTimezone: true }).notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		key: varchar({ length: 1024 }).notNull(),
		value: jsonb().$type<MiRegistryItem['value']>().default({}),
		scope: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
		domain: varchar({ length: 512 }),
	},
	(table) => [
		index('IDX_REGISTRY_ITEM_USER_ID').on(table.userId),
		index('IDX_REGISTRY_ITEM_SCOPE').on(table.scope),
		index('IDX_REGISTRY_ITEM_DOMAIN').on(table.domain),
		unique('UQ_REGISTRY_ITEM_USER_ID_DOMAIN_SCOPE_KEY')
			.on(table.userId, table.domain, table.scope, table.key)
			.nullsNotDistinct(),
	],
);

export type RegistryItemRow = typeof registryItem.$inferSelect;
export type RegistryItemInsert = typeof registryItem.$inferInsert;
