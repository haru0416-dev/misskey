/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import {
	deleteAccessTokenByIdAndUserIdFromDatabase,
	deleteAccessTokenByTokenAndUserIdFromDatabase,
	existsAccessTokenByIdFromDatabase,
	existsAccessTokenByTokenFromDatabase,
} from '@/core/AccessTokenStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = {
	anyOf: [
		{
			type: 'object',
			properties: {
				tokenId: { type: 'string', format: 'misskey:id' },
			},
			required: ['tokenId'],
		},
		{
			type: 'object',
			properties: {
				token: { type: 'string', nullable: true },
			},
			required: ['token'],
		},
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,
	) {
		super(meta, paramDef, async (ps, me) => {
			if ('tokenId' in ps) {
				const tokenExist = await existsAccessTokenByIdFromDatabase(this.db, ps.tokenId);

				if (tokenExist) {
					await deleteAccessTokenByIdAndUserIdFromDatabase(this.db, ps.tokenId, me.id);
				}
			} else if (ps.token) {
				const tokenExist = await existsAccessTokenByTokenFromDatabase(this.db, ps.token);

				if (tokenExist) {
					await deleteAccessTokenByTokenAndUserIdFromDatabase(this.db, ps.token, me.id);
				}
			}
		});
	}
}
