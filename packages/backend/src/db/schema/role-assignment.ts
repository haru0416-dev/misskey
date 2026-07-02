/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';

export const roleAssignment = pgTable('role_assignment', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	roleId: varchar({ length: 32 }).notNull().$type<MiRole['id']>(),
	expiresAt: timestamp({ withTimezone: true }),
}, table => [
	uniqueIndex('IDX_0953deda7ce6e1448e935859e5').on(table.userId, table.roleId),
	index('IDX_db5b72c16227c97ca88734d5c2').on(table.userId),
	index('IDX_f0de67fd09cd3cd0aabca79994').on(table.roleId),
	index('IDX_539b6c08c05067599743bb6389').on(table.expiresAt),
]);

export type RoleAssignmentRow = typeof roleAssignment.$inferSelect;
export type RoleAssignmentInsert = typeof roleAssignment.$inferInsert;
