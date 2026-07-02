/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';
import type { RegistrationTicketRow } from '@/db/schema/registration-ticket.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchRegistrationTicketByIdOrFailFromDatabase } from '@/core/RegistrationTicketStore.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class InviteCodeEntityService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: RegistrationTicketRow['id'] | RegistrationTicketRow,
		me?: { id: MiUser['id'] } | null | undefined,
		hints?: {
			packedCreatedBy?: Packed<'UserLite'>,
			packedUsedBy?: Packed<'UserLite'>,
		},
	): Promise<Packed<'InviteCode'>> {
		const target = typeof src === 'object' ? src : await fetchRegistrationTicketByIdOrFailFromDatabase(this.db, src);

		return await awaitAll({
			id: target.id,
			code: target.code,
			expiresAt: target.expiresAt ? target.expiresAt.toISOString() : null,
			createdAt: this.idService.parse(target.id).date.toISOString(),
			createdBy: target.createdById ? hints?.packedCreatedBy ?? (await this.userEntityService.pack(target.createdById, me)) : null,
			usedBy: target.usedById ? hints?.packedUsedBy ?? (await this.userEntityService.pack(target.usedById, me)) : null,
			usedAt: target.usedAt ? target.usedAt.toISOString() : null,
			used: !!target.usedAt,
		});
	}

	@bindThis
	public async packMany(
		tickets: RegistrationTicketRow[],
		me: { id: MiUser['id'] },
	) {
		const _createdBys = tickets.map(({ createdById }) => createdById).filter(x => x != null);
		const _usedBys = tickets.map(({ usedById }) => usedById).filter(x => x != null);
		const _userMap = await this.userEntityService.packMany([..._createdBys, ..._usedBys], me)
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(
			tickets.map(ticket => {
				const packedCreatedBy = ticket.createdById != null ? _userMap.get(ticket.createdById) : undefined;
				const packedUsedBy = ticket.usedById != null ? _userMap.get(ticket.usedById) : undefined;
				return this.pack(ticket, me, { packedCreatedBy, packedUsedBy });
			}),
		);
	}
}
