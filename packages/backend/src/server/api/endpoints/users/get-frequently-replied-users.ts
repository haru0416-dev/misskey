/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { maximum } from '@/misc/prelude/array.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listFrequentlyRepliedUsersFromDatabase } from '@/core/NoteStore.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Get a list of other users that the specified user frequently replies to.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserDetailed',
				},
				weight: {
					type: 'number',
					optional: false, nullable: false,
				},
			},
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'e6965129-7b2a-40a4-bae2-cd84cd434822',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private getterService: GetterService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Lookup user
			const user = await this.getterService.getUser(ps.userId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			const repliedUsers = await listFrequentlyRepliedUsersFromDatabase(this.db, user.id, ps.limit);
			if (repliedUsers.length === 0) return [];

			const peak = maximum(repliedUsers.map(row => row.count));
			const topRepliedUserIds = repliedUsers.map(row => row.userId);
			const repliedUserCounts = new Map(repliedUsers.map(row => [row.userId, row.count]));

			// Make replies object (includes weights)
			const _userMap = await this.userEntityService.packMany(topRepliedUserIds, me, { schema: 'UserDetailed' })
				.then(users => new Map(users.map(u => [u.id, u])));
			const repliesObj = await Promise.all(topRepliedUserIds.map(async (userId) => ({
				user: _userMap.get(userId) ?? (await this.userEntityService.pack(userId, me, { schema: 'UserDetailed' })),
				weight: repliedUserCounts.get(userId)! / peak,
			})));

			return repliesObj;
		});
	}
}
