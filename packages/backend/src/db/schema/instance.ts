/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiInstance } from '@/models/Instance.js';

export const instanceSuspensionStateEnum = pgEnum('instance_suspensionstate_enum', [
	'none',
	'manuallySuspended',
	'goneSuspended',
	'autoSuspendedForNotResponding',
]);

export const instance = pgTable('instance', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	firstRetrievedAt: timestamp({ withTimezone: true }).notNull(),
	host: varchar({ length: 128 }).notNull(),
	usersCount: integer().default(0).notNull(),
	notesCount: integer().default(0).notNull(),
	followingCount: integer().default(0).notNull(),
	followersCount: integer().default(0).notNull(),
	latestRequestReceivedAt: timestamp({ withTimezone: true }),
	isNotResponding: boolean().default(false).notNull(),
	notRespondingSince: timestamp({ withTimezone: true }),
	suspensionState: instanceSuspensionStateEnum().$type<MiInstance['suspensionState']>().default('none').notNull(),
	softwareName: varchar({ length: 64 }),
	softwareVersion: varchar({ length: 64 }),
	openRegistrations: boolean(),
	name: varchar({ length: 256 }),
	description: varchar({ length: 4096 }),
	maintainerName: varchar({ length: 128 }),
	maintainerEmail: varchar({ length: 256 }),
	iconUrl: varchar({ length: 256 }),
	faviconUrl: varchar({ length: 256 }),
	themeColor: varchar({ length: 64 }),
	infoUpdatedAt: timestamp({ withTimezone: true }),
	moderationNote: varchar({ length: 16384 }).default('').notNull(),
}, table => [
	index('IDX_f7b9d338207e40e768e4a5265a').on(table.firstRetrievedAt),
	uniqueIndex('IDX_8d5afc98982185799b160e10eb').on(table.host),
	index('IDX_3ede46f507c87ad698051d56a8').on(table.suspensionState),
]);

export type InstanceRow = typeof instance.$inferSelect;
export type InstanceInsert = typeof instance.$inferInsert;
