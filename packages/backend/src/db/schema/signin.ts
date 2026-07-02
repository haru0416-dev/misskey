/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiSignin } from '@/models/Signin.js';
import type { MiUser } from '@/models/User.js';

export const signin = pgTable('signin', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	ip: varchar({ length: 128 }).notNull(),
	headers: jsonb().$type<MiSignin['headers']>().notNull(),
	success: boolean().notNull(),
}, table => [
	index('IDX_2c308dbdc50d94dc625670055f').on(table.userId),
	index('IDX_SIGNIN_USER_ID_ID').on(table.userId, table.id),
]);

export type SigninRow = typeof signin.$inferSelect;
export type SigninInsert = typeof signin.$inferInsert;
