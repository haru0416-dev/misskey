/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { channel } from './channel.js';

export const channelMuting = pgTable('channel_muting', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	channelId: varchar({ length: 32 }).notNull().$type<MiChannel['id']>().references(() => channel.id, { onDelete: 'cascade' }),
	expiresAt: timestamp({ withTimezone: true }),
}, table => [
	index('IDX_34415e3062ae7a94617496e81c').on(table.userId),
	index('IDX_4d534d7177fc59879d942e96d0').on(table.channelId),
	index('IDX_6dd314e96806b7df65ddadff72').on(table.expiresAt),
	uniqueIndex('IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE').on(table.userId, table.channelId),
]);

export type ChannelMutingRow = typeof channelMuting.$inferSelect;
export type ChannelMutingInsert = typeof channelMuting.$inferInsert;
