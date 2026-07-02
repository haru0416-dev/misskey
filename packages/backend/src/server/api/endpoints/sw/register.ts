/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IdService } from '@/core/IdService.js';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import {
	createSwSubscriptionInDatabase,
	fetchSwSubscriptionFromDatabase,
	isDuplicateKeyValueDatabaseError,
	updateSwSubscriptionByUserAndEndpointInDatabase,
	updateSwSubscriptionInDatabase,
} from '@/core/SwSubscriptionStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	description: 'Register to receive push notifications.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			state: {
				type: 'string',
				optional: true, nullable: false,
				enum: ['already-subscribed', 'subscribed'],
			},
			key: {
				type: 'string',
				optional: false, nullable: true,
			},
			userId: {
				type: 'string',
				optional: false, nullable: false,
			},
			endpoint: {
				type: 'string',
				optional: false, nullable: false,
			},
			sendReadMessage: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
		auth: { type: 'string' },
		publickey: { type: 'string' },
		sendReadMessage: { type: 'boolean', default: false },
	},
	required: ['endpoint', 'auth', 'publickey'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private pushNotificationService: PushNotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// if already subscribed
			const exist = await fetchSwSubscriptionFromDatabase(this.drizzle, me.id, ps.endpoint);

			if (exist != null) {
				const isSameSubscription = exist.auth === ps.auth
					&& exist.publickey === ps.publickey
					&& exist.sendReadMessage === ps.sendReadMessage;

				if (!isSameSubscription) {
					await updateSwSubscriptionInDatabase(this.drizzle, exist.id, {
						auth: ps.auth,
						publickey: ps.publickey,
						sendReadMessage: ps.sendReadMessage,
					});
					this.pushNotificationService.refreshCache(me.id);
				}

				return {
					state: isSameSubscription ? 'already-subscribed' as const : 'subscribed' as const,
					key: this.serverSettings.swPublicKey,
					userId: me.id,
					endpoint: ps.endpoint,
					sendReadMessage: ps.sendReadMessage,
				};
			}

			try {
				await createSwSubscriptionInDatabase(this.drizzle, {
					id: this.idService.gen(),
					userId: me.id,
					endpoint: ps.endpoint,
					auth: ps.auth,
					publickey: ps.publickey,
					sendReadMessage: ps.sendReadMessage,
				});
			} catch (e) {
				if (!isDuplicateKeyValueDatabaseError(e)) throw e;

				await updateSwSubscriptionByUserAndEndpointInDatabase(this.drizzle, me.id, ps.endpoint, {
					auth: ps.auth,
					publickey: ps.publickey,
					sendReadMessage: ps.sendReadMessage,
				});
			}

			this.pushNotificationService.refreshCache(me.id);

			return {
				state: 'subscribed' as const,
				key: this.serverSettings.swPublicKey,
				userId: me.id,
				endpoint: ps.endpoint,
				sendReadMessage: ps.sendReadMessage,
			};
		});
	}
}
