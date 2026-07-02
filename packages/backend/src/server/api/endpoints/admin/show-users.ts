/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { RoleService } from '@/core/RoleService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listAdminUsersFromDatabase } from '@/core/UserStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'array',
		nullable: false, optional: false,
		items: {
			type: 'object',
			nullable: false, optional: false,
			ref: 'UserDetailed',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt', '+lastActiveDate', '-lastActiveDate'] },
		state: { type: 'string', enum: ['all', 'alive', 'available', 'admin', 'moderator', 'adminOrModerator', 'suspended'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'combined' },
		username: { type: 'string', nullable: true, default: null },
		hostname: {
			type: 'string',
			nullable: true,
			default: null,
			description: 'The local host is represented with `null`.',
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let roleUserIds: string[] | null = null;

			switch (ps.state) {
				case 'admin': {
					roleUserIds = await this.roleService.getAdministratorIds();
					if (roleUserIds.length === 0) return [];
					break;
				}
				case 'moderator': {
					roleUserIds = await this.roleService.getModeratorIds({ includeAdmins: false });
					if (roleUserIds.length === 0) return [];
					break;
				}
				case 'adminOrModerator': {
					roleUserIds = await this.roleService.getModeratorIds({ includeAdmins: true });
					if (roleUserIds.length === 0) return [];
					break;
				}
			}

			const users = await listAdminUsersFromDatabase(this.db, {
				limit: ps.limit,
				offset: ps.offset,
				sort: ps.sort,
				state: ps.state,
				origin: ps.origin,
				usernamePrefix: ps.username ? sqlLikeEscape(ps.username.toLowerCase()) + '%' : null,
				hostname: ps.hostname,
				roleUserIds,
			});

			return await this.userEntityService.packMany(users, me, { schema: 'UserDetailed' });
		});
	}
}
