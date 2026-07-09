/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const registrationTicket = pgTable('registration_ticket', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	code: varchar({ length: 64 }).notNull(),
	expiresAt: timestamp({ withTimezone: true }),
	createdById: varchar({ length: 32 }).$type<MiUser['id'] | null>().references(() => user.id, { onDelete: 'cascade' }),
	usedById: varchar({ length: 32 }).$type<MiUser['id'] | null>().references(() => user.id, { onDelete: 'cascade' }),
	usedAt: timestamp({ withTimezone: true }),
	pendingUserId: varchar({ length: 32 }),
}, table => [
	uniqueIndex('IDX_0ff69e8dfa9fe31bb4a4660f59').on(table.code),
	index('IDX_beba993576db0261a15364ea96').on(table.createdById),
	index('IDX_b6f93f2f30bdbb9a5ebdc7c718').on(table.usedById),
	uniqueIndex('REL_b6f93f2f30bdbb9a5ebdc7c718').on(table.usedById),
]);

export type RegistrationTicketRow = typeof registrationTicket.$inferSelect;
export type RegistrationTicketInsert = typeof registrationTicket.$inferInsert;
