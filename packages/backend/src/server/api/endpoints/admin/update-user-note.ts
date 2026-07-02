/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:user-note',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string' },
	},
	required: ['userId', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await fetchUserByIdFromDatabase(this.db, ps.userId);

			if (user == null) {
				throw new Error('user not found');
			}

			const currentProfile = await fetchUserProfileByUserIdOrFailFromDatabase(this.db, user.id);

			await updateUserProfileInDatabase(this.db, user.id, {
				moderationNote: ps.text,
			});

			this.moderationLogService.log(me, 'updateUserNote', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				before: currentProfile.moderationNote,
				after: ps.text,
			});
		});
	}
}
