/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { role } from './role.js';

export const roleAssignment = pgTable('role_assignment', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	roleId: varchar({ length: 32 }).notNull().$type<MiRole['id']>().references(() => role.id, { onDelete: 'cascade' }),
	expiresAt: timestamp({ withTimezone: true }),
}, table => [
	uniqueIndex('IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE').on(table.userId, table.roleId),
	index('IDX_ROLE_ASSIGNMENT_USER_ID').on(table.userId),
	index('IDX_ROLE_ASSIGNMENT_ROLE_ID').on(table.roleId),
	index('IDX_ROLE_ASSIGNMENT_EXPIRES_AT').on(table.expiresAt),
]);

export type RoleAssignmentRow = typeof roleAssignment.$inferSelect;
export type RoleAssignmentInsert = typeof roleAssignment.$inferInsert;
