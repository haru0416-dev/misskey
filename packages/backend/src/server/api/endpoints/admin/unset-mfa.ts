/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { unsetUserMfaInDatabase } from '@/core/UserProfileStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:unset-mfa',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
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
				throw new ApiError(meta.errors.noSuchUser);
			}

			await unsetUserMfaInDatabase(this.db, user.id).then(() => {
				this.moderationLogService.log(me, 'unsetMfa', {
					userId: user.id,
					userUsername: user.username,
					userHost: user.host,
				});
			});
		});
	}
}
