/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { hashtag } from './hashtag.js';
import { user } from './user.js';

/**
 * hashtag の *UsersCount を重複なく数えるための対応表。同じ利用者の再利用では hashtag 行を書き換えない。
 * 利用者 ID の配列を更新する方式は、利用者数に比例して WAL と時間が増えるので、
 * 複合主キーによる重複検出で配列全体の書き換えを避ける。
 */
export const hashtagUser = pgTable(
	'hashtag_user',
	{
		hashtagId: varchar({ length: 32 })
			.notNull()
			.references(() => hashtag.id, { onDelete: 'cascade' }),
		/** false は投稿でタグを使った人 (mentioned*)、true はプロフィールにタグを付けた人 (attached*)。 */
		attached: boolean().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		primaryKey({ name: 'PK_HASHTAG_USER', columns: [table.hashtagId, table.attached, table.userId] }),
		index('IDX_HASHTAG_USER_USER_ID').on(table.userId),
	],
);

export type HashtagUserRow = typeof hashtagUser.$inferSelect;
