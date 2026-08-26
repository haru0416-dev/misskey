/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	createSystemWebhookWithSideEffects,
	deleteSystemWebhookWithSideEffects,
	updateSystemWebhookWithSideEffects,
} from '@/core/webhook/SystemWebhookLogic.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/queue/SystemWebhookQueue.js';
import { fetchSystemWebhookByIdFromDatabase, listSystemWebhooksFromDatabase } from '@/core/webhook/SystemWebhookStore.js';
import { NoSuchSystemWebhookForTestError, testSystemWebhookWithQueue } from '@/core/webhook/SystemWebhookTestLogic.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { Config } from '@/config.js';
import type { SystemWebhookDeliverQueue } from '@/core/queue/queues.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { omitUndefined } from '@/misc/clone.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import { systemWebhookEventTypes, type SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminSystemWebhookDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

export const adminSystemWebhookCreateParamDef = z.object({
	isActive: z.boolean(),
	name: z.string().min(1).max(255),
	on: z.array(z.enum(systemWebhookEventTypes)),
	url: z.string().min(1).max(1024),
	secret: z.string().max(1024).default(''),
});

export const adminSystemWebhookDeleteParamDef = z.object({
	id: misskeyId(),
});

export const adminSystemWebhookListParamDef = z.object({
	isActive: z.boolean().optional(),
	on: z.array(z.enum(systemWebhookEventTypes)).optional(),
});

export const adminSystemWebhookShowParamDef = z.object({
	id: misskeyId(),
});

export const adminSystemWebhookTestParamDef = z.object({
	webhookId: misskeyId(),
	type: z.enum(systemWebhookEventTypes),
	override: z
		.object({
			url: z.string().optional(),
			secret: z.string().optional(),
		})
		.optional(),
});

export const adminSystemWebhookUpdateParamDef = z.object({
	id: misskeyId(),
	isActive: z.boolean(),
	name: z.string().min(1).max(255),
	on: z.array(z.enum(systemWebhookEventTypes)),
	url: z.string().min(1).max(1024),
	secret: z.string().max(1024).default(''),
});

type AdminSystemWebhookCreateParams = Omit<z.infer<typeof adminSystemWebhookCreateParamDef>, 'on'> & {
	on: SystemWebhookEventType[];
};
type AdminSystemWebhookListParams = Omit<z.infer<typeof adminSystemWebhookListParamDef>, 'on'> & {
	on?: SystemWebhookEventType[];
};
type AdminSystemWebhookTestParams = Omit<z.infer<typeof adminSystemWebhookTestParamDef>, 'type'> & {
	type: SystemWebhookEventType;
};
type AdminSystemWebhookUpdateParams = Omit<z.infer<typeof adminSystemWebhookUpdateParamDef>, 'on'> & {
	on: SystemWebhookEventType[];
};

export function packHonoApiSystemWebhook(webhook: MiSystemWebhook): Packed<'SystemWebhook'> {
	return {
		id: webhook.id,
		isActive: webhook.isActive,
		updatedAt: webhook.updatedAt.toISOString(),
		latestSentAt: webhook.latestSentAt?.toISOString() ?? null,
		latestStatus: webhook.latestStatus,
		name: webhook.name,
		on: webhook.on,
		url: webhook.url,
		secret: webhook.secret,
	};
}

function packHonoApiSystemWebhooks(webhooks: MiSystemWebhook[]): Packed<'SystemWebhook'>[] {
	return webhooks.map((webhook) => packHonoApiSystemWebhook(webhook)).sort((a, b) => a.id.localeCompare(b.id));
}

function noSuchSystemWebhookError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such SystemWebhook.',
		code: 'NO_SUCH_SYSTEM_WEBHOOK',
		id: '38dd1ffe-04b4-6ff5-d8ba-4e6a6ae22c9d',
		kind: 'server',
	});
}

function noSuchWebhookError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such webhook.',
		code: 'NO_SUCH_WEBHOOK',
		id: '0c52149c-e913-18f8-5dc7-74870bfe0cf9',
	});
}

export async function handleHonoApiAdminSystemWebhookCreate(
	deps: HonoApiAdminSystemWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'SystemWebhook'>> {
	const params = parseHonoApiParams(adminSystemWebhookCreateParamDef, body);
	const webhook = await createSystemWebhookWithSideEffects(
		{
			db: deps.db,
			genId,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		params,
		me,
	);

	return packHonoApiSystemWebhook(webhook);
}

export async function handleHonoApiAdminSystemWebhookDelete(
	deps: HonoApiAdminSystemWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminSystemWebhookDeleteParamDef, body);
	await deleteSystemWebhookWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		params.id,
		me,
	);
}

export async function handleHonoApiAdminSystemWebhookList(
	deps: HonoApiAdminSystemWebhookDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'SystemWebhook'>[]> {
	const params = parseHonoApiParams(adminSystemWebhookListParamDef, body);
	const webhooks = await listSystemWebhooksFromDatabase(
		deps.db,
		omitUndefined({
			isActive: params.isActive,
			on: params.on,
		}),
	);

	return packHonoApiSystemWebhooks(webhooks);
}

export async function handleHonoApiAdminSystemWebhookShow(
	deps: HonoApiAdminSystemWebhookDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'SystemWebhook'>> {
	const params = parseHonoApiParams(adminSystemWebhookShowParamDef, body);
	const webhook = await fetchSystemWebhookByIdFromDatabase(deps.db, params.id);
	if (webhook == null) throw noSuchSystemWebhookError();

	return packHonoApiSystemWebhook(webhook);
}

export async function handleHonoApiAdminSystemWebhookTest(
	deps: HonoApiAdminSystemWebhookDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminSystemWebhookTestParamDef, body);
	const testParams =
		params.override === undefined
			? {
					webhookId: params.webhookId,
					type: params.type,
				}
			: {
					webhookId: params.webhookId,
					type: params.type,
					override: omitUndefined(params.override),
				};
	try {
		await testSystemWebhookWithQueue(
			{
				fetchSystemWebhooksByIds: (ids) => listSystemWebhooksFromDatabase(deps.db, { ids }),
				enqueueSystemWebhookDeliver: (webhook, type, content, opts) =>
					enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, deps.config, webhook, type, content, opts),
				populateEmojis: async () => ({}),
			},
			testParams,
		);
	} catch (e) {
		if (e instanceof NoSuchSystemWebhookForTestError) {
			throw noSuchWebhookError();
		}
		throw e;
	}
}

export async function handleHonoApiAdminSystemWebhookUpdate(
	deps: HonoApiAdminSystemWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'SystemWebhook'>> {
	const params = parseHonoApiParams(adminSystemWebhookUpdateParamDef, body);
	const webhook = await updateSystemWebhookWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		params,
		me,
	);

	return packHonoApiSystemWebhook(webhook);
}
