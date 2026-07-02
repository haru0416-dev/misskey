/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../../error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { countUserSecurityKeysByUserIdFromDatabase } from '@/core/UserSecurityKeyStore.js';
import { updateUserProfileInDatabase } from '@/core/UserProfileStore.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		noKey: {
			message: 'No security key.',
			code: 'NO_SECURITY_KEY',
			id: 'f9c54d7f-d4c2-4d3c-9a8g-a70daac86512',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		value: { type: 'boolean' },
	},
	required: ['value'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.value === true) {
				// セキュリティキーがなければパスワードレスを有効にはできない
				const keyCount = await countUserSecurityKeysByUserIdFromDatabase(this.db, me.id);

				if (keyCount === 0) {
					await updateUserProfileInDatabase(this.db, me.id, {
						usePasswordLessLogin: false,
					});

					throw new ApiError(meta.errors.noKey);
				}
			}

			await updateUserProfileInDatabase(this.db, me.id, {
				usePasswordLessLogin: ps.value,
			});

			// Publish meUpdated event
			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
