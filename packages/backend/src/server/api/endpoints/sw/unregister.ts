/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { deleteSwSubscriptionByEndpointFromDatabase } from '@/core/SwSubscriptionStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['account'],

	requireCredential: false,

	description: 'Unregister from receiving push notifications.',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private pushNotificationService: PushNotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await deleteSwSubscriptionByEndpointFromDatabase(this.drizzle, me?.id ?? null, ps.endpoint);

			if (me) {
				this.pushNotificationService.refreshCache(me.id);
			}
		});
	}
}
