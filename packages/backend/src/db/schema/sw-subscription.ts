/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const swSubscription = pgTable('sw_subscription', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	endpoint: varchar({ length: 512 }).notNull(),
	auth: varchar({ length: 256 }).notNull(),
	publickey: varchar({ length: 128 }).notNull(),
	sendReadMessage: boolean().default(false).notNull(),
}, table => [
	index('IDX_97754ca6f2baff9b4abb7f853d').on(table.userId),
	index('IDX_SW_SUBSCRIPTION_ENDPOINT').on(table.endpoint),
	uniqueIndex('IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE').on(table.userId, table.endpoint),
]);

export type SwSubscriptionRow = typeof swSubscription.$inferSelect;
export type SwSubscriptionInsert = typeof swSubscription.$inferInsert;
