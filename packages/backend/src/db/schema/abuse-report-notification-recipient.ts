/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, foreignKey, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { RecipientMethod } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { userProfile } from './user-profile.js';
import { systemWebhook } from './system-webhook.js';

export const abuseReportNotificationRecipient = pgTable(
	'abuse_report_notification_recipient',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		isActive: boolean().default(true).notNull(),
		updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
		name: varchar({ length: 255 }).notNull(),
		method: varchar({ length: 64 }).notNull().$type<RecipientMethod>(),
		userId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.default(null)
			.references(() => user.id, { onDelete: 'cascade' }),
		systemWebhookId: varchar({ length: 32 })
			.$type<MiSystemWebhook['id'] | null>()
			.default(null)
			.references(() => systemWebhook.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_abuse_report_notification_recipient_isActive').on(table.isActive),
		index('IDX_abuse_report_notification_recipient_method').on(table.method),
		index('IDX_abuse_report_notification_recipient_userId').on(table.userId),
		index('IDX_abuse_report_notification_recipient_systemWebhookId').on(table.systemWebhookId),
		// userIdは user.id と user_profile.userId の両方にFKを持つ(旧migrationのFK_..._userId1/2を再現)
		foreignKey({
			columns: [table.userId],
			foreignColumns: [userProfile.userId],
		}).onDelete('cascade'),
	],
);

export type AbuseReportNotificationRecipientRow = typeof abuseReportNotificationRecipient.$inferSelect;
export type AbuseReportNotificationRecipientInsert = typeof abuseReportNotificationRecipient.$inferInsert;
