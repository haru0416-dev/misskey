/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countNoteDraftsByUserIdFromDatabase } from '@/core/NoteDraftStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiNoteDraftDependencies = {
	db: MiDrizzleDatabase;
};

const countNoteDraftsParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

export async function handleHonoApiNotesDraftsCount(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<number> {
	parseHonoApiParams(countNoteDraftsParamDef, body);
	return await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
}
