/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';
import { channel } from './channel.js';
import { user } from './user.js';

export const channelFavorite = pgTable('channel_favorite', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	channelId: varchar({ length: 32 }).notNull().$type<MiChannel['id']>().references(() => channel.id, { onDelete: 'cascade' }),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_CHANNEL_FAVORITE_CHANNEL_ID').on(table.channelId),
	index('IDX_CHANNEL_FAVORITE_USER_ID').on(table.userId),
	uniqueIndex('IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE').on(table.userId, table.channelId),
]);

export type ChannelFavoriteRow = typeof channelFavorite.$inferSelect;
export type ChannelFavoriteInsert = typeof channelFavorite.$inferInsert;
