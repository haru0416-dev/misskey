/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deleteWebhookFromDatabase, fetchWebhookByIdAndUserIdFromDatabase, listWebhooksByUserIdFromDatabase, updateWebhookInDatabase } from '@/core/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { webhookEventTypes, type MiWebhook, type WebhookEventTypes } from '@/models/Webhook.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiWebhookDependencies = {
	db: MiDrizzleDatabase;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

export type HonoApiUserWebhook = {
	id: string;
	userId: string;
	name: string;
	on: WebhookEventTypes[];
	url: string;
	secret: string;
	active: boolean;
	latestSentAt: string | null;
	latestStatus: number | null;
};

const webhooksListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const webhooksShowParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
	},
	required: ['webhookId'],
} as const;

const webhooksDeleteParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
	},
	required: ['webhookId'],
} as const;

const webhooksUpdateParamDef = {
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

type WebhooksShowParams = {
	webhookId: string;
};

type WebhooksDeleteParams = {
	webhookId: string;
};

type WebhooksUpdateParams = {
	webhookId: string;
	name?: string;
	url?: string;
	secret?: string | null;
	on?: WebhookEventTypes[];
	active?: boolean;
};

function packUserWebhook(webhook: MiWebhook): HonoApiUserWebhook {
	return {
		id: webhook.id,
		userId: webhook.userId,
		name: webhook.name,
		on: webhook.on,
		url: webhook.url,
		secret: webhook.secret,
		active: webhook.active,
		latestSentAt: webhook.latestSentAt ? webhook.latestSentAt.toISOString() : null,
		latestStatus: webhook.latestStatus,
	};
}

export async function handleHonoApiIWebhooksList(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiUserWebhook[]> {
	parseHonoApiParams(webhooksListParamDef, body);
	const webhooks = await listWebhooksByUserIdFromDatabase(deps.db, me.id);
	return webhooks.map(webhook => packUserWebhook(webhook));
}

export async function handleHonoApiIWebhooksShow(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiUserWebhook> {
	const params = parseHonoApiParams(webhooksShowParamDef, body) as WebhooksShowParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: '50f614d9-3047-4f7e-90d8-ad6b2d5fb098',
		});
	}

	return packUserWebhook(webhook);
}

export async function handleHonoApiIWebhooksDelete(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(webhooksDeleteParamDef, body) as WebhooksDeleteParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'bae73e5a-5522-4965-ae19-3a8688e71d82',
		});
	}

	await deleteWebhookFromDatabase(deps.db, webhook.id);
	deps.publishInternalEvent?.('webhookDeleted', webhook);
}

export async function handleHonoApiIWebhooksUpdate(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(webhooksUpdateParamDef, body) as WebhooksUpdateParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'fb0fea69-da18-45b1-828d-bd4fd1612518',
		});
	}

	const updated = await updateWebhookInDatabase(deps.db, webhook.id, {
		name: params.name,
		url: params.url,
		secret: params.secret === null ? '' : params.secret,
		on: params.on,
		active: params.active,
	});

	if (updated == null) {
		throw new Error(`Webhook ${webhook.id} not found`);
	}

	deps.publishInternalEvent?.('webhookUpdated', updated);
}
