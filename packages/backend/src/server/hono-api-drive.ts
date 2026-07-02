/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { driveFileExistsByMd5AndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiDriveDependencies = {
	db: MiDrizzleDatabase;
};

const driveFilesCheckExistenceParamDef = {
	type: 'object',
	properties: {
		md5: { type: 'string' },
	},
	required: ['md5'],
} as const;

type DriveFilesCheckExistenceParams = {
	md5: string;
};

export async function handleHonoApiDriveFilesCheckExistence(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<boolean> {
	const params = parseHonoApiParams(driveFilesCheckExistenceParamDef, body) as DriveFilesCheckExistenceParams;
	return await driveFileExistsByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);
}
