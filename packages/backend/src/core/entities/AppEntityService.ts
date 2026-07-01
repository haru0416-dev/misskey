/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Packed } from '@/misc/json-schema.js';
import type { AppRow } from '@/db/schema/app.js';
import type { MiUser } from '@/models/User.js';
import { fetchAppByIdOrFailFromDatabase } from '@/core/AppStore.js';
import { existsAccessTokenByAppIdAndUserIdFromDatabase } from '@/core/AccessTokenStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class AppEntityService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,
	) {
	}

	@bindThis
	public async pack(
		src: AppRow['id'] | AppRow,
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean,
			includeSecret?: boolean,
			includeProfileImageIds?: boolean
		},
	): Promise<Packed<'App'>> {
		const opts = Object.assign({
			detail: false,
			includeSecret: false,
			includeProfileImageIds: false,
		}, options);

		const app = typeof src === 'object' ? src : await fetchAppByIdOrFailFromDatabase(this.db, src);

		return {
			id: app.id,
			name: app.name,
			callbackUrl: app.callbackUrl,
			permission: app.permission,
			...(opts.includeSecret ? { secret: app.secret } : {}),
			...(me ? {
				isAuthorized: await existsAccessTokenByAppIdAndUserIdFromDatabase(this.db, app.id, me.id),
			} : {}),
		};
	}
}
