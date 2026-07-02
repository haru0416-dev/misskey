/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserListEntityService } from '@/core/entities/UserListEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { listUserListsByUserIdFromDatabase } from '@/core/UserListStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['lists', 'account'],

	requireCredential: false,

	kind: 'read:account',

	description: 'Show all lists that the authenticated user has created.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserList',
		},
	},
	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a8af4a82-0980-4cc4-a6af-8b0ffd54465e',
		},
		remoteUser: {
			message: 'Not allowed to load the remote user\'s list',
			code: 'REMOTE_USER_NOT_ALLOWED',
			id: '53858f1b-3315-4a01-81b7-db9b48d4b79a',
		},
		invalidParam: {
			message: 'Invalid param.',
			code: 'INVALID_PARAM',
			id: 'ab36de0e-29e9-48cb-9732-d82f1281620d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable() // eslint-disable-next-line import/no-default-export
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userListEntityService: UserListEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (typeof ps.userId !== 'undefined') {
				const user = await fetchUserByIdFromDatabase(this.db, ps.userId);
				if (user === null) throw new ApiError(meta.errors.noSuchUser);
				if (user.host !== null) throw new ApiError(meta.errors.remoteUser);
			} else if (me === null) {
				throw new ApiError(meta.errors.invalidParam);
			}

			const userLists = typeof ps.userId === 'undefined'
				? await listUserListsByUserIdFromDatabase(this.db, me!.id)
				: await listUserListsByUserIdFromDatabase(this.db, ps.userId, { publicOnly: true });

			return await Promise.all(userLists.map(x => this.userListEntityService.pack(x)));
		});
	}
}
