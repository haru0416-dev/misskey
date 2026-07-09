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
	index('IDX_USER_SECURITY_KEY_USER_ID').on(table.userId),
	index('IDX_USER_SECURITY_KEY_PUBLIC_KEY').on(table.publicKey),
]);

export type UserSecurityKeyRow = typeof userSecurityKey.$inferSelect;
export type UserSecurityKeyInsert = typeof userSecurityKey.$inferInsert;
