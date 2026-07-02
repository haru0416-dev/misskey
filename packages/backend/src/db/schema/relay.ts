/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgEnum, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiRelay } from '@/models/Relay.js';

export const relayStatusEnum = pgEnum('relay_status_enum', ['requesting', 'accepted', 'rejected']);

export const relay = pgTable('relay', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	inbox: varchar({ length: 512 }).notNull(),
	status: relayStatusEnum().notNull().$type<MiRelay['status']>(),
}, table => [
	uniqueIndex('IDX_0d9a1738f2cf7f3b1c3334dfab').on(table.inbox),
]);

export type RelayRow = typeof relay.$inferSelect;
export type RelayInsert = typeof relay.$inferInsert;
