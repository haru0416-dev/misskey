/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const swSubscription = pgTable('sw_subscription', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	endpoint: varchar({ length: 512 }).notNull(),
	auth: varchar({ length: 256 }).notNull(),
	publickey: varchar({ length: 128 }).notNull(),
	sendReadMessage: boolean().default(false).notNull(),
}, table => [
	index('IDX_SW_SUBSCRIPTION_ENDPOINT').on(table.endpoint),
	uniqueIndex('IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE').on(table.userId, table.endpoint),
]);

export type SwSubscriptionRow = typeof swSubscription.$inferSelect;
export type SwSubscriptionInsert = typeof swSubscription.$inferInsert;
