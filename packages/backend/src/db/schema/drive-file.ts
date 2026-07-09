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
	index('IDX_DRIVE_FILE_USER_ID').on(table.userId),
	index('IDX_DRIVE_FILE_USER_HOST').on(table.userHost),
	index('IDX_DRIVE_FILE_MD5').on(table.md5),
	index('IDX_DRIVE_FILE_TYPE').on(table.type),
	uniqueIndex('IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE').on(table.accessKey),
	uniqueIndex('IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE').on(table.thumbnailAccessKey),
	uniqueIndex('IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE').on(table.webpublicAccessKey),
	index('IDX_DRIVE_FILE_URI').on(table.uri),
	index('IDX_DRIVE_FILE_FOLDER_ID').on(table.folderId),
	index('IDX_DRIVE_FILE_IS_SENSITIVE').on(table.isSensitive),
	index('IDX_DRIVE_FILE_MAYBE_SENSITIVE').on(table.maybeSensitive),
	index('IDX_DRIVE_FILE_MAYBE_PORN').on(table.maybePorn),
	index('IDX_DRIVE_FILE_IS_LINK').on(table.isLink),
	index('IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID').on(table.userId, table.folderId, table.id),
]);

export type DriveFileRow = typeof driveFile.$inferSelect;
export type DriveFileInsert = typeof driveFile.$inferInsert;
