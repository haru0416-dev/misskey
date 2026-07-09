/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, integer, jsonb, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { driveFolder } from './drive-folder.js';

export const driveFile = pgTable('drive_file', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).$type<MiUser['id'] | null>().references(() => user.id, { onDelete: 'set null' }),
	userHost: varchar({ length: 128 }),
	md5: varchar({ length: 32 }).notNull(),
	name: varchar({ length: 256 }).notNull(),
	type: varchar({ length: 128 }).notNull(),
	size: integer().notNull(),
	comment: varchar({ length: 512 }),
	blurhash: varchar({ length: 128 }),
	properties: jsonb().$type<MiDriveFile['properties']>().default({}).notNull(),
	storedInternal: boolean().notNull(),
	url: varchar({ length: 1024 }).notNull(),
	thumbnailUrl: varchar({ length: 512 }),
	webpublicUrl: varchar({ length: 512 }),
	webpublicType: varchar({ length: 128 }),
	accessKey: varchar({ length: 256 }),
	thumbnailAccessKey: varchar({ length: 256 }),
	webpublicAccessKey: varchar({ length: 256 }),
	uri: varchar({ length: 1024 }),
	src: varchar({ length: 1024 }),
	folderId: varchar({ length: 32 }).$type<MiDriveFolder['id'] | null>().references(() => driveFolder.id, { onDelete: 'set null' }),
	isSensitive: boolean().default(false).notNull(),
	maybeSensitive: boolean().default(false).notNull(),
	maybePorn: boolean().default(false).notNull(),
	isLink: boolean().default(false).notNull(),
	requestHeaders: jsonb().$type<MiDriveFile['requestHeaders']>().default({}),
	requestIp: varchar({ length: 128 }),
}, table => [
	index('IDX_860fa6f6c7df5bb887249fba22').on(table.userId),
	index('IDX_92779627994ac79277f070c91e').on(table.userHost),
	index('IDX_37bb9a1b4585f8a3beb24c62d6').on(table.md5),
	index('IDX_a40b8df8c989d7db937ea27cf6').on(table.type),
	uniqueIndex('IDX_d85a184c2540d2deba33daf642').on(table.accessKey),
	uniqueIndex('IDX_e74022ce9a074b3866f70e0d27').on(table.thumbnailAccessKey),
	uniqueIndex('IDX_c55b2b7c284d9fef98026fc88e').on(table.webpublicAccessKey),
	index('IDX_e5848eac4940934e23dbc17581').on(table.uri),
	index('IDX_bb90d1956dafc4068c28aa7560').on(table.folderId),
	index('IDX_a7eba67f8b3fa27271e85d2e26').on(table.isSensitive),
	index('IDX_3b33dff77bb64b23c88151d23e').on(table.maybeSensitive),
	index('IDX_8bdcd3dd2bddb78014999a16ce').on(table.maybePorn),
	index('IDX_315c779174fe8247ab324f036e').on(table.isLink),
	index('IDX_55720b33a61a7c806a8215b825').on(table.userId, table.folderId, table.id),
]);

export type DriveFileRow = typeof driveFile.$inferSelect;
export type DriveFileInsert = typeof driveFile.$inferInsert;
