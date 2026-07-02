/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { webhookEventTypes } from '@/models/Webhook.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { fetchWebhookByIdAndUserIdFromDatabase, updateWebhookInDatabase } from '@/core/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['webhooks'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchWebhook: {
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'fb0fea69-da18-45b1-828d-bd4fd1612518',
		},
	},

} as const;

export const paramDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', nullable: true, maxLength: 1024 },
		on: { type: 'array', items: {
			type: 'string', enum: webhookEventTypes,
		} },
		active: { type: 'boolean' },
	},
	required: ['webhookId'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const webhook = await fetchWebhookByIdAndUserIdFromDatabase(this.db, ps.webhookId, me.id);

			if (webhook == null) {
				throw new ApiError(meta.errors.noSuchWebhook);
			}

			const updated = await updateWebhookInDatabase(this.db, webhook.id, {
				name: ps.name,
				url: ps.url,
				secret: ps.secret === null ? '' : ps.secret,
				on: ps.on,
				active: ps.active,
			});

			if (updated == null) {
				throw new Error(`Webhook ${webhook.id} not found`);
			}

			this.globalEventService.publishInternalEvent('webhookUpdated', updated);
		});
	}
}
