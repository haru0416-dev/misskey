/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueueService } from '@/core/QueueService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listFollowingsByFollowerHostFromDatabase } from '@/core/FollowingStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:federation',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private queueService: QueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const followings = await listFollowingsByFollowerHostFromDatabase(this.db, ps.host);

			this.queueService.createUnfollowJob(followings.map(following => ({
				from: { id: following.followerId },
				to: { id: following.followeeId },
				silent: true,
			})));
		});
	}
}
