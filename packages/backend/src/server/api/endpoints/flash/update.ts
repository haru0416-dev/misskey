/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { fetchFlashByIdFromDatabase, updateFlashInDatabase } from '@/core/FlashStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['flash'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:flash',

	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	errors: {
		noSuchFlash: {
			message: 'No such flash.',
			code: 'NO_SUCH_FLASH',
			id: '611e13d2-309e-419a-a5e4-e0422da39b02',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '08e60c88-5948-478e-a132-02ec701d67b2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string' },
		summary: { type: 'string' },
		script: { type: 'string' },
		permissions: { type: 'array', items: {
			type: 'string',
		} },
		visibility: { type: 'string', enum: ['public', 'private'] },
	},
	required: ['flashId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
	) {
		super(meta, paramDef, async (ps, me) => {
			const flash = await fetchFlashByIdFromDatabase(this.drizzle, ps.flashId);
			if (flash == null) {
				throw new ApiError(meta.errors.noSuchFlash);
			}
			if (flash.userId !== me.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await updateFlashInDatabase(this.drizzle, flash.id, {
				updatedAt: new Date(),
				...Object.fromEntries(
					Object.entries(ps).filter(
						([key, val]) => (key !== 'flashId') && Object.hasOwn(paramDef.properties, key),
					),
				),
			});
		});
	}
}
