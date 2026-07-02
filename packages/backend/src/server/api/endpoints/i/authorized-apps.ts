/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { DI } from '@/di-symbols.js';
import { listAccessTokensWithAppByUserIdFromDatabase } from '@/core/AccessTokenStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
					optional: false,
				},
				name: {
					type: 'string',
					optional: false,
				},
				callbackUrl: {
					type: 'string',
					optional: false, nullable: true,
				},
				permission: {
					type: 'array',
					optional: false,
					uniqueItems: true,
					items: {
						type: 'string',
					},
				},
				isAuthorized: {
					type: 'boolean',
					optional: true,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private appEntityService: AppEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Get tokens
			const tokens = await listAccessTokensWithAppByUserIdFromDatabase(this.db, me.id, {
				limit: ps.limit,
				offset: ps.offset,
				direction: ps.sort === 'asc' ? 'asc' : 'desc',
			});

			return await Promise.all(tokens.map(token => this.appEntityService.pack(token.appId!, me, {
				detail: true,
			})));
		});
	}
}
