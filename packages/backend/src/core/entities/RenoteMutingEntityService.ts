/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { fetchRenoteMutingByIdOrFailFromDatabase } from '@/core/RenoteMutingStore.js';
import type { RenoteMutingRow } from '@/db/schema/renote-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { UserEntityService } from './UserEntityService.js';

export type RenoteMutingPackable = RenoteMutingRow & {
	mutee?: MiUser | null;
};

@Injectable()
export class RenoteMutingEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: RenoteMutingRow['id'] | RenoteMutingPackable,
		me?: { id: MiUser['id'] } | null | undefined,
		hints?: {
			packedMutee?: Packed<'UserDetailedNotMe'>
		},
	): Promise<Packed<'RenoteMuting'>> {
		const muting = typeof src === 'object' ? src : await fetchRenoteMutingByIdOrFailFromDatabase(this.drizzle, src);

		return await awaitAll({
			id: muting.id,
			createdAt: this.idService.parse(muting.id).date.toISOString(),
			muteeId: muting.muteeId,
			mutee: hints?.packedMutee ?? this.userEntityService.pack(muting.muteeId, me, {
				schema: 'UserDetailedNotMe',
			}),
		});
	}

	@bindThis
	public async packMany(
		mutings: RenoteMutingPackable[],
		me: { id: MiUser['id'] },
	) {
		const _users = mutings.map(({ mutee, muteeId }) => mutee ?? muteeId);
		const _userMap = await this.userEntityService.packMany(_users, me, { schema: 'UserDetailedNotMe' })
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(mutings.map(muting => this.pack(muting, me, { packedMutee: _userMap.get(muting.muteeId) })));
	}
}
