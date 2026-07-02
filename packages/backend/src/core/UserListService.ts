/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import * as Redis from 'ioredis';
import { ModuleRef } from '@nestjs/core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { IdService } from '@/core/IdService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import {
	countUserListMembershipsByUserListIdInDatabase,
	createUserListMembershipInDatabase,
	deleteUserListMembershipInDatabase,
	fetchUserListMembershipByUserIdAndUserListIdFromDatabase,
	listUserListMembershipUserIdsByUserListIdFromDatabase,
	updateUserListMembershipWithRepliesInDatabase,
} from '@/core/UserListMembershipStore.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';
import { RedisKVCache } from '@/misc/cache.js';
import { RoleService } from '@/core/RoleService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';

@Injectable()
export class UserListService implements OnApplicationShutdown, OnModuleInit {
	public static TooManyUsersError = class extends Error {};

	public membersCache: RedisKVCache<Set<string>>;
	private roleService: RoleService;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
	) {
		this.membersCache = new RedisKVCache<Set<string>>(this.redisClient, 'userListMembers', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60, // 1m
			fetcher: (key) => listUserListMembershipUserIdsByUserListIdFromDatabase(this.db, key).then(ids => new Set(ids)),
			toRedisConverter: (value) => JSON.stringify(Array.from(value)),
			fromRedisConverter: (value) => new Set(JSON.parse(value)),
		});

		this.redisForSub.on('message', this.onMessage);
	}

	async onModuleInit() {
		this.roleService = this.moduleRef.get(RoleService.name);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'userListMemberAdded': {
					const { userListId, memberId } = body;
					const members = await this.membersCache.get(userListId);
					if (members) {
						members.add(memberId);
					}
					break;
				}
				case 'userListMemberRemoved': {
					const { userListId, memberId } = body;
					const members = await this.membersCache.get(userListId);
					if (members) {
						members.delete(memberId);
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async addMember(target: MiUser, list: MiUserList, me: MiUser, options: { withReplies?: boolean } = {}) {
		const currentCount = await countUserListMembershipsByUserListIdInDatabase(this.db, list.id);
		if (currentCount >= (await this.roleService.getUserPolicies(me.id)).userEachUserListsLimit) {
			throw new UserListService.TooManyUsersError();
		}

		await createUserListMembershipInDatabase(this.db, {
			id: this.idService.gen(),
			userId: target.id,
			userListId: list.id,
			userListUserId: list.userId,
			withReplies: options.withReplies ?? false,
		});

		this.globalEventService.publishInternalEvent('userListMemberAdded', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userAdded', await this.userEntityService.pack(target));

		// このインスタンス内にこのリモートユーザーをフォローしているユーザーがいなくても投稿を受け取るためにダミーのユーザーがフォローしたということにする
		if (this.userEntityService.isRemoteUser(target)) {
			const proxy = await this.systemAccountService.fetch('proxy');
			this.queueService.createFollowJob([{ from: { id: proxy.id }, to: { id: target.id } }]);
		}
	}

	@bindThis
	public async removeMember(target: MiUser, list: MiUserList) {
		await deleteUserListMembershipInDatabase(this.db, target.id, list.id);

		this.globalEventService.publishInternalEvent('userListMemberRemoved', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userRemoved', await this.userEntityService.pack(target));
	}

	@bindThis
	public async updateMembership(target: MiUser, list: MiUserList, options: { withReplies?: boolean }) {
		const membership = await fetchUserListMembershipByUserIdAndUserListIdFromDatabase(this.db, target.id, list.id);

		if (membership == null) {
			throw new Error('User is not a member of the list');
		}

		await updateUserListMembershipWithRepliesInDatabase(this.db, membership.id, options.withReplies);
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.membersCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
