/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { hashtag } from './hashtag.js';
import { user } from './user.js';

/**
 * タグを使った利用者。hashtag の *UsersCount を重複なく数えるためだけに持つ。
 * 以前は hashtag の行に利用者 ID の配列を持たせていたが、同じ人がまた使うだけでも配列全体を書き直し、
 * 5 万人のタグで 1 件あたり 1.1 MB の WAL と 136 ms がかかっていた。行にすれば、既に数えた人は索引を引くだけで済む。
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
