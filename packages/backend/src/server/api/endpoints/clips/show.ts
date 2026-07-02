/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { DI } from '@/di-symbols.js';
import { fetchClipByIdFromDatabase } from '@/core/ClipStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['clips', 'account'],

	requireCredential: false,

	kind: 'read:account',

	errors: {
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Clip',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		clipId: { type: 'string', format: 'misskey:id' },
	},
	required: ['clipId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private clipEntityService: ClipEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Fetch the clip
			const clip = await fetchClipByIdFromDatabase(this.db, ps.clipId);

			if (clip == null) {
				throw new ApiError(meta.errors.noSuchClip);
			}

			if (!clip.isPublic && (me == null || (clip.userId !== me.id))) {
				throw new ApiError(meta.errors.noSuchClip);
			}

			return await this.clipEntityService.pack(clip, me);
		});
	}
}
