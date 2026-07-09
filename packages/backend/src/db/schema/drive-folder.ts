/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, varchar, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const driveFolder = pgTable('drive_folder', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	name: varchar({ length: 128 }).notNull(),
	userId: varchar({ length: 32 }).$type<MiUser['id'] | null>().references(() => user.id, { onDelete: 'cascade' }),
	parentId: varchar({ length: 32 }).$type<string | null>().references((): AnyPgColumn => driveFolder.id, { onDelete: 'set null' }),
}, table => [
	index('IDX_f4fc06e49c0171c85f1c48060d').on(table.userId),
	index('IDX_00ceffb0cdc238b3233294f08f').on(table.parentId),
]);

export type DriveFolderRow = typeof driveFolder.$inferSelect;
export type DriveFolderInsert = typeof driveFolder.$inferInsert;
