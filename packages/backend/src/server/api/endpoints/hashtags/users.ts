/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { safeForSql } from "@/misc/safe-for-sql.js";
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listUsersByTagFromDatabase } from '@/core/UserStore.js';

export const meta = {
	requireCredential: false,

	tags: ['hashtags', 'users'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserDetailed',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tag: { type: 'string' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt'] },
		state: { type: 'string', enum: ['all', 'alive'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
	},
	required: ['tag', 'sort'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tag = normalizeForSearch(ps.tag);
			if (!safeForSql(tag)) throw new Error('Injection');

			const users = await listUsersByTagFromDatabase(this.db, {
				tag,
				limit: ps.limit,
				offset: ps.offset,
				sort: ps.sort,
				state: ps.state,
				origin: ps.origin,
			});

			return await this.userEntityService.packMany(users, me, { schema: 'UserDetailed' });
		});
	}
}
