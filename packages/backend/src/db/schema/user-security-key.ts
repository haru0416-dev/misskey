/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bigint, boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const userSecurityKey = pgTable('user_security_key', {
	id: varchar().primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	name: varchar({ length: 30 }).notNull(),
	publicKey: varchar().notNull(),
	counter: bigint({ mode: 'number' }).default(0).notNull(),
	lastUsed: timestamp({ withTimezone: true }).defaultNow().notNull(),
	credentialDeviceType: varchar({ length: 32 }),
	credentialBackedUp: boolean(),
	transports: varchar({ length: 32 }).array(),
}, table => [
	index('IDX_ff9ca3b5f3ee3d0681367a9b44').on(table.userId),
	index('IDX_0d7718e562dcedd0aa5cf2c9f7').on(table.publicKey),
]);

export type UserSecurityKeyRow = typeof userSecurityKey.$inferSelect;
export type UserSecurityKeyInsert = typeof userSecurityKey.$inferInsert;
