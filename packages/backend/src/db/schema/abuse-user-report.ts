/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { AbuseReportResolveType } from '@/models/AbuseUserReport.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const abuseUserReport = pgTable('abuse_user_report', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	targetUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	reporterId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	assigneeId: varchar({ length: 32 }).$type<MiUser['id'] | null>().references(() => user.id, { onDelete: 'set null' }),
	resolved: boolean().default(false).notNull(),
	forwarded: boolean().default(false).notNull(),
	comment: varchar({ length: 2048 }).notNull(),
	moderationNote: varchar({ length: 8192 }).default('').notNull(),
	resolvedAs: varchar({ length: 128 }).$type<AbuseReportResolveType | null>(),
	targetUserHost: varchar({ length: 128 }),
	reporterHost: varchar({ length: 128 }),
}, table => [
	index('IDX_ABUSE_USER_REPORT_TARGET_USER_ID').on(table.targetUserId),
	index('IDX_ABUSE_USER_REPORT_REPORTER_ID').on(table.reporterId),
	index('IDX_ABUSE_USER_REPORT_RESOLVED').on(table.resolved),
	index('IDX_ABUSE_USER_REPORT_TARGET_USER_HOST').on(table.targetUserHost),
	index('IDX_ABUSE_USER_REPORT_REPORTER_HOST').on(table.reporterHost),
	index('IDX_ABUSE_USER_REPORT_RESOLVED_ID').on(table.resolved, table.id),
	index('IDX_ABUSE_USER_REPORT_TARGET_HOST_ID').on(table.targetUserHost, table.id),
	index('IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID').on(table.reporterHost, table.id),
	index('IDX_ABUSE_USER_REPORT_ASSIGNEE_ID').on(table.assigneeId),
]);

export type AbuseUserReportRow = typeof abuseUserReport.$inferSelect;
export type AbuseUserReportInsert = typeof abuseUserReport.$inferInsert;
