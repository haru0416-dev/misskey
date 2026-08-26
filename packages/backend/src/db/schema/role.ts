/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, integer, jsonb, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiRole, RoleCondFormulaValue } from '@/models/Role.js';

export const roleTargetEnum = pgEnum('role_target_enum', ['manual', 'conditional']);

export const role = pgTable('role', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	lastUsedAt: timestamp({ withTimezone: true }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	description: varchar({ length: 1024 }).notNull(),
	color: varchar({ length: 256 }),
	iconUrl: varchar({ length: 512 }),
	target: roleTargetEnum().default('manual').notNull(),
	condFormula: jsonb()
		.$type<RoleCondFormulaValue>()
		.default({} as RoleCondFormulaValue)
		.notNull(),
	isPublic: boolean().default(false).notNull(),
	asBadge: boolean().default(false).notNull(),
	isModerator: boolean().default(false).notNull(),
	isAdministrator: boolean().default(false).notNull(),
	isExplorable: boolean().default(false).notNull(),
	preserveAssignmentOnMoveAccount: boolean().default(false).notNull(),
	canEditMembersByModerator: boolean().default(false).notNull(),
	displayOrder: integer().default(0).notNull(),
	policies: jsonb().$type<MiRole['policies']>().default({}).notNull(),
});

export type RoleRow = typeof role.$inferSelect;
export type RoleInsert = typeof role.$inferInsert;
