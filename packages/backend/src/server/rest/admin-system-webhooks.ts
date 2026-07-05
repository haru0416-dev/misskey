/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createSystemWebhookWithSideEffects, deleteSystemWebhookWithSideEffects, updateSystemWebhookWithSideEffects } from '@/core/SystemWebhookLogic.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/SystemWebhookQueue.js';
import { fetchSystemWebhookByIdFromDatabase, listSystemWebhooksFromDatabase } from '@/core/SystemWebhookStore.js';
import { NoSuchSystemWebhookForTestError, testSystemWebhookWithQueue } from '@/core/SystemWebhookTestLogic.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { Config } from '@/config.js';
import type { SystemWebhookDeliverQueue } from '@/core/QueueModule.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
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

const adminSystemWebhookCreateParamDef = {
	type: 'object',
	properties: {
		isActive: { type: 'boolean' },
		name: { type: 'string', minLength: 1, maxLength: 255 },
		on: { type: 'array', items: {
			type: 'string',
			enum: systemWebhookEventTypes,
		} },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', maxLength: 1024, default: '' },
	},
	required: ['isActive', 'name', 'on', 'url'],
} as const;

const adminSystemWebhookDeleteParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminSystemWebhookListParamDef = {
	type: 'object',
	properties: {
		isActive: { type: 'boolean' },
		on: { type: 'array', items: {
			type: 'string',
			enum: systemWebhookEventTypes,
		} },
	},
	required: [],
} as const;

const adminSystemWebhookShowParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminSystemWebhookTestParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
		type: {
			type: 'string',
			enum: systemWebhookEventTypes,
		},
		override: {
			type: 'object',
			properties: {
				url: { type: 'string', nullable: false },
				secret: { type: 'string', nullable: false },
			},
		},
	},
	required: ['webhookId', 'type'],
} as const;

const adminSystemWebhookUpdateParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		isActive: { type: 'boolean' },
		name: { type: 'string', minLength: 1, maxLength: 255 },
		on: { type: 'array', items: {
			type: 'string',
			enum: systemWebhookEventTypes,
		} },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', maxLength: 1024, default: '' },
	},
	required: ['id', 'isActive', 'name', 'on', 'url'],
} as const;

type AdminSystemWebhookCreateParams = Omit<SchemaType<typeof adminSystemWebhookCreateParamDef>, 'on'> & {
	on: SystemWebhookEventType[];
};
type AdminSystemWebhookListParams = Omit<SchemaType<typeof adminSystemWebhookListParamDef>, 'on'> & {
	on?: SystemWebhookEventType[];
};
type AdminSystemWebhookTestParams = Omit<SchemaType<typeof adminSystemWebhookTestParamDef>, 'type'> & {
	type: SystemWebhookEventType;
};
type AdminSystemWebhookUpdateParams = Omit<SchemaType<typeof adminSystemWebhookUpdateParamDef>, 'on'> & {
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
	return webhooks
		.map(webhook => packHonoApiSystemWebhook(webhook))
		.sort((a, b) => a.id.localeCompare(b.id));
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
	const webhook = await createSystemWebhookWithSideEffects({
		db: deps.db,
		genId: () => genId(deps.config),
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, params, me);

	return packHonoApiSystemWebhook(webhook);
}

export async function handleHonoApiAdminSystemWebhookDelete(
	deps: HonoApiAdminSystemWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminSystemWebhookDeleteParamDef, body);
	await deleteSystemWebhookWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, params.id, me);
}

export async function handleHonoApiAdminSystemWebhookList(
	deps: HonoApiAdminSystemWebhookDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'SystemWebhook'>[]> {
	const params = parseHonoApiParams(adminSystemWebhookListParamDef, body);
	const webhooks = await listSystemWebhooksFromDatabase(deps.db, {
		isActive: params.isActive,
		on: params.on,
	});

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
	try {
		await testSystemWebhookWithQueue({
			fetchSystemWebhooksByIds: ids => listSystemWebhooksFromDatabase(deps.db, { ids }),
			enqueueSystemWebhookDeliver: (webhook, type, content, opts) => enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, webhook, type, content, opts),
			populateEmojis: async () => ({}),
		}, params);
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
	const webhook = await updateSystemWebhookWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, params, me);

	return packHonoApiSystemWebhook(webhook);
}
