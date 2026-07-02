/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { fetchAuthSessionByIdOrFailFromDatabase } from '@/core/AuthSessionStore.js';
import type { AuthSessionRow } from '@/db/schema/auth-session.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { AppEntityService } from './AppEntityService.js';

@Injectable()
export class AuthSessionEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private appEntityService: AppEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: AuthSessionRow['id'] | AuthSessionRow,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const session = typeof src === 'object' ? src : await fetchAuthSessionByIdOrFailFromDatabase(this.drizzle, src);

		return await awaitAll({
			id: session.id,
			app: this.appEntityService.pack(session.appId, me),
			token: session.token,
		});
	}
}
