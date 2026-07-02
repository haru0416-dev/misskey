/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchWebhookByIdAndUserIdFromDatabase, listWebhooksByUserIdFromDatabase } from '@/core/WebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiWebhookDependencies = {
	db: MiDrizzleDatabase;
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

type WebhooksShowParams = {
	webhookId: string;
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
