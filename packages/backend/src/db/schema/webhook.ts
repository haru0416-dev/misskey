/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import { user } from './user.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const webhook = pgTable(
	'webhook',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: varchar({ length: 128 }).notNull(),
		on: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull().$type<WebhookEventTypes[]>(),
		url: varchar({ length: 1024 }).notNull(),
		secret: varchar({ length: 1024 }).notNull(),
		active: boolean().default(true).notNull(),
		latestSentAt: timestamp({ withTimezone: true }),
		latestStatus: integer(),
	},
	(table) => [
		index('IDX_WEBHOOK_USER_ID').on(table.userId),
		index('IDX_WEBHOOK_ON').on(table.on),
		index('IDX_WEBHOOK_ACTIVE').on(table.active),
	],
);

export type WebhookRow = typeof webhook.$inferSelect;
export type WebhookInsert = typeof webhook.$inferInsert;

/**
 * webhook テーブルは `user` リレーションを持つが、既存コードはいずれの経路でも
 * relation を読み込まないため、ここでも常に `user: null` を補って
 * MiWebhook 形状に揃える。
 */
export function deserializeWebhook(row: WebhookRow): MiWebhook {
	return {
		...row,
		user: null,
	};
}
