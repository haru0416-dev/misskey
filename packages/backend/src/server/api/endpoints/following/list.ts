/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { FollowingEntityService } from '@/core/entities/FollowingEntityService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listFollowingsByFollowerIdWithPaginationFromDatabase, resolveFollowingPagination } from '@/core/FollowingStore.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:following',
	description: 'List of following users',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Following',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		notification: { type: 'boolean', default: false },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private followingEntityService: FollowingEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const pagination = resolveFollowingPagination(this.idService, ps);
			const followings = await listFollowingsByFollowerIdWithPaginationFromDatabase(this.db, me.id, {
				...pagination,
				notification: ps.notification,
				limit: ps.limit,
			});

			return await this.followingEntityService.packMany(followings, me, { populateFollowee: true });
		});
	}
}
