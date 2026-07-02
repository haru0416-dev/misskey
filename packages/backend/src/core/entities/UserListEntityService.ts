/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiUserList } from '@/models/UserList.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listUserListMembershipUserIdsByUserListIdFromDatabase } from '@/core/UserListMembershipStore.js';
import { fetchUserListByIdOrFailFromDatabase } from '@/core/UserListStore.js';
import type { UserListMembershipRow } from '@/db/schema/user-list-membership.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class UserListEntityService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiUserList['id'] | MiUserList,
	): Promise<Packed<'UserList'>> {
		const userList = typeof src === 'object' ? src : await fetchUserListByIdOrFailFromDatabase(this.db, src);

		const userIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(this.db, userList.id);

		return {
			id: userList.id,
			createdAt: this.idService.parse(userList.id).date.toISOString(),
			name: userList.name,
			userIds,
			isPublic: userList.isPublic,
		};
	}

	@bindThis
	public async packMembershipsMany(
		memberships: UserListMembershipRow[],
	) {
		const _userMap = await this.userEntityService.packMany(memberships.map(({ userId }) => userId))
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(memberships.map(async x => ({
			id: x.id,
			createdAt: this.idService.parse(x.id).date.toISOString(),
			userId: x.userId,
			user: _userMap.get(x.userId) ?? await this.userEntityService.pack(x.userId),
			withReplies: x.withReplies,
		})));
	}
}
