/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const passwordResetRequest = pgTable(
	'password_reset_request',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		token: varchar({ length: 256 }).notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		uniqueIndex('IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE').on(table.token),
		index('IDX_PASSWORD_RESET_REQUEST_USER_ID').on(table.userId),
	],
);

export type PasswordResetRequestRow = typeof passwordResetRequest.$inferSelect;
export type PasswordResetRequestInsert = typeof passwordResetRequest.$inferInsert;
