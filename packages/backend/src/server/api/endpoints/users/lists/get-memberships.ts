/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserListEntityService } from '@/core/entities/UserListEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listUserListMembershipsByUserListIdWithPaginationFromDatabase, resolveUserListMembershipPagination } from '@/core/UserListMembershipStore.js';
import { fetchPublicUserListByIdFromDatabase, fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['lists', 'account'],

	requireCredential: false,

	kind: 'read:account',

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
		},
	},

	res: {
		type: 'array',
		items: {
			type: 'object',
			nullable: false,
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
				},
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
				userId: {
					type: 'string',
					format: 'misskey:id',
				},
				user: {
					type: 'object',
					ref: 'UserLite',
				},
				withReplies: {
					type: 'boolean',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		forPublic: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['listId'],
} as const;

@Injectable() // eslint-disable-next-line import/no-default-export
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userListEntityService: UserListEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Fetch the list
			const userList = !ps.forPublic && me !== null
				? await fetchUserListByIdAndUserIdFromDatabase(this.db, ps.listId, me.id)
				: await fetchPublicUserListByIdFromDatabase(this.db, ps.listId);

			if (userList == null) {
				throw new ApiError(meta.errors.noSuchList);
			}

			const pagination = resolveUserListMembershipPagination(this.idService, ps);
			const memberships = await listUserListMembershipsByUserListIdWithPaginationFromDatabase(this.db, userList.id, {
				limit: ps.limit,
				order: pagination.order,
				sinceId: pagination.sinceId,
				untilId: pagination.untilId,
			});

			return this.userListEntityService.packMembershipsMany(memberships);
		});
	}
}
