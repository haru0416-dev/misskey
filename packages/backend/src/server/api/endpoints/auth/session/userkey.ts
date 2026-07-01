/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { deleteAuthSessionByIdFromDatabase, fetchAuthSessionByTokenAndAppIdFromDatabase } from '@/core/AuthSessionStore.js';
import { fetchAppBySecretFromDatabase } from '@/core/AppStore.js';
import { fetchAccessTokenByAppIdAndUserIdOrFailFromDatabase } from '@/core/AccessTokenStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['auth'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			accessToken: {
				type: 'string',
				optional: false, nullable: false,
			},

			user: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserDetailedNotMe',
			},
		},
	},

	errors: {
		noSuchApp: {
			message: 'No such app.',
			code: 'NO_SUCH_APP',
			id: 'fcab192a-2c5a-43b7-8ad8-9b7054d8d40d',
		},

		noSuchSession: {
			message: 'No such session.',
			code: 'NO_SUCH_SESSION',
			id: '5b5a1503-8bc8-4bd0-8054-dc189e8cdcb3',
		},

		pendingSession: {
			message: 'This session is not completed yet.',
			code: 'PENDING_SESSION',
			id: '8c8a4145-02cc-4cca-8e66-29ba60445a8e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		appSecret: { type: 'string' },
		token: { type: 'string' },
	},
	required: ['appSecret', 'token'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Lookup app
			const app = await fetchAppBySecretFromDatabase(this.drizzle, ps.appSecret);

			if (app == null) {
				throw new ApiError(meta.errors.noSuchApp);
			}

			// Fetch token
			const session = await fetchAuthSessionByTokenAndAppIdFromDatabase(this.drizzle, ps.token, app.id);

			if (session == null) {
				throw new ApiError(meta.errors.noSuchSession);
			}

			if (session.userId == null) {
				throw new ApiError(meta.errors.pendingSession);
			}

			// Lookup access token
			const accessToken = await fetchAccessTokenByAppIdAndUserIdOrFailFromDatabase(this.drizzle, app.id, session.userId);

			// Delete session
			await deleteAuthSessionByIdFromDatabase(this.drizzle, session.id);

			return {
				accessToken: accessToken.token,
				user: await this.userEntityService.pack(session.userId, null, {
					schema: 'UserDetailedNotMe',
				}),
			};
		});
	}
}
