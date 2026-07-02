/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { RoleService } from '@/core/RoleService.js';
import { deleteFlashInDatabase, fetchFlashByIdFromDatabase } from '@/core/FlashStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['flashs'],

	requireCredential: true,

	kind: 'write:flash',

	errors: {
		noSuchFlash: {
			message: 'No such flash.',
			code: 'NO_SUCH_FLASH',
			id: 'de1623ef-bbb3-4289-a71e-14cfa83d9740',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '1036ad7b-9f92-4fff-89c3-0e50dc941704',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
	},
	required: ['flashId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private moderationLogService: ModerationLogService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const flash = await fetchFlashByIdFromDatabase(this.drizzle, ps.flashId);

			if (flash == null) {
				throw new ApiError(meta.errors.noSuchFlash);
			}

			if (!await this.roleService.isModerator(me) && flash.userId !== me.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await deleteFlashInDatabase(this.drizzle, flash.id);

			if (flash.userId !== me.id) {
				const user = await fetchUserByIdOrFailFromDatabase(this.drizzle, flash.userId);
				this.moderationLogService.log(me, 'deleteFlash', {
					flashId: flash.id,
					flashUserId: flash.userId,
					flashUserUsername: user.username,
					flash,
				});
			}
		});
	}
}
