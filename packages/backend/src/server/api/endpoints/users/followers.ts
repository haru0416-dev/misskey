/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { FollowingEntityService } from '@/core/entities/FollowingEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { followingExistsInDatabase, listFollowersByFolloweeIdWithPaginationFromDatabase, resolveFollowingPagination } from '@/core/FollowingStore.js';
import { IdService } from '@/core/IdService.js';
import { fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Show everyone that follows this user.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Following',
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '27fa5435-88ab-43de-9360-387de88727cd',
		},

		forbidden: {
			message: 'Forbidden.',
			code: 'FORBIDDEN',
			id: '3c6a84db-d619-26af-ca14-06232a21df8a',
		},
	},
} as const;

export const paramDef = {
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						userId: { type: 'string', format: 'misskey:id' },
					},
					required: ['userId'],
				},
				{
					type: 'object',
					properties: {
						username: { type: 'string' },
						host: {
							type: 'string',
							nullable: true,
							description: 'The local host is represented with `null`.',
						},
					},
					required: ['username', 'host'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				sinceId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				sinceDate: { type: 'integer' },
				untilDate: { type: 'integer' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
			},
		},
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private utilityService: UtilityService,
		private followingEntityService: FollowingEntityService,
		private idService: IdService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = 'userId' in ps
				? await fetchUserByIdFromDatabase(this.drizzle, ps.userId)
				: await fetchUserByUsernameAndHostFromDatabase(this.drizzle, ps.username, this.utilityService.toPunyNullable(ps.host));

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, user.id);

			if (profile.followersVisibility !== 'public' && !await this.roleService.isModerator(me)) {
				if (profile.followersVisibility === 'private') {
					if (me == null || (me.id !== user.id)) {
						throw new ApiError(meta.errors.forbidden);
					}
				} else if (profile.followersVisibility === 'followers') {
					if (me == null) {
						throw new ApiError(meta.errors.forbidden);
					} else if (me.id !== user.id) {
						const isFollowing = await followingExistsInDatabase(this.drizzle, me.id, user.id);
						if (!isFollowing) {
							throw new ApiError(meta.errors.forbidden);
						}
					}
				}
			}

			const pagination = resolveFollowingPagination(this.idService, ps);
			const followings = await listFollowersByFolloweeIdWithPaginationFromDatabase(this.drizzle, user.id, {
				...pagination,
				limit: ps.limit,
			});

			return await this.followingEntityService.packMany(followings, me, { populateFollower: true });
		});
	}
}
