/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { AbuseReportResolveType } from '@/models/AbuseUserReport.js';
import type { MiUser } from '@/models/User.js';

export const abuseUserReport = pgTable('abuse_user_report', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	targetUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	reporterId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	assigneeId: varchar({ length: 32 }).$type<MiUser['id'] | null>(),
	resolved: boolean().default(false).notNull(),
	forwarded: boolean().default(false).notNull(),
	comment: varchar({ length: 2048 }).notNull(),
	moderationNote: varchar({ length: 8192 }).default('').notNull(),
	resolvedAs: varchar({ length: 128 }).$type<AbuseReportResolveType | null>(),
	targetUserHost: varchar({ length: 128 }),
	reporterHost: varchar({ length: 128 }),
}, table => [
	index('IDX_a9021cc2e1feb5f72d3db6e9f5').on(table.targetUserId),
	index('IDX_04cc96756f89d0b7f9473e8cdf').on(table.reporterId),
	index('IDX_2b15aaf4a0dc5be3499af7ab6a').on(table.resolved),
	index('IDX_4ebbf7f93cdc10e8d1ef2fc6cd').on(table.targetUserHost),
	index('IDX_f8d8b93740ad12c4ce8213a199').on(table.reporterHost),
	index('IDX_ABUSE_USER_REPORT_RESOLVED_ID').on(table.resolved, table.id),
	index('IDX_ABUSE_USER_REPORT_TARGET_HOST_ID').on(table.targetUserHost, table.id),
	index('IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID').on(table.reporterHost, table.id),
	index('IDX_ABUSE_USER_REPORT_ASSIGNEE_ID').on(table.assigneeId),
]);

export type AbuseUserReportRow = typeof abuseUserReport.$inferSelect;
export type AbuseUserReportInsert = typeof abuseUserReport.$inferInsert;
