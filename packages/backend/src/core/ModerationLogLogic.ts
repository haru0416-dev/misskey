/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiUser } from '@/models/User.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';
import { createModerationLogInDatabase } from './ModerationLogStore.js';

export async function logModerationEventInDatabase<T extends typeof moderationLogTypes[number]>(
	deps: {
		config: Pick<Config, 'id'>;
		db: MiDrizzleDatabase;
	},
	moderator: { id: MiUser['id'] },
	type: T,
	info?: ModerationLogPayloads[T],
): Promise<void> {
	await createModerationLogInDatabase(deps.db, {
		id: genId(deps.config),
		userId: moderator.id,
		type,
		info: info ?? {},
	});
}
