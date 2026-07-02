/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { updateFollowingsByFollowerIdInDatabase } from '@/core/FollowingStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFollowingDependencies = {
	db: MiDrizzleDatabase;
};

const followingUpdateAllParamDef = {
	type: 'object',
	properties: {
		notify: { type: 'string', enum: ['normal', 'none'] },
		withReplies: { type: 'boolean' },
	},
} as const;

type FollowingUpdateAllParams = {
	notify?: 'normal' | 'none';
	withReplies?: boolean;
};

export async function handleHonoApiFollowingUpdateAll(
	deps: HonoApiFollowingDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(followingUpdateAllParamDef, body) as FollowingUpdateAllParams;
	await updateFollowingsByFollowerIdInDatabase(deps.db, me.id, {
		notify: params.notify != null ? (params.notify === 'none' ? null : params.notify) : undefined,
		withReplies: params.withReplies != null ? params.withReplies : undefined,
	});
}
