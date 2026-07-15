/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiUser } from '@/models/User.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';
import { createModerationLogInDatabase, createModerationLogsInDatabase } from './ModerationLogStore.js';

export async function logModerationEventInDatabase<T extends typeof moderationLogTypes[number]>(
	deps: {
		db: MiDrizzleDatabase;
	},
	moderator: { id: MiUser['id'] },
	type: T,
	info?: ModerationLogPayloads[T],
): Promise<void> {
	await createModerationLogInDatabase(deps.db, {
		id: genId(),
		userId: moderator.id,
		type,
		info: info ?? {},
	});
}

export async function logModerationEventsInDatabase<T extends typeof moderationLogTypes[number]>(
	deps: {
		db: MiDrizzleDatabase;
	},
	moderator: { id: MiUser['id'] },
	type: T,
	infos: ModerationLogPayloads[T][],
): Promise<void> {
	await createModerationLogsInDatabase(deps.db, infos.map(info => ({
		id: genId(),
		userId: moderator.id,
		type,
		info,
	})));
}
