/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InternalEventTypes } from '@/core/global-events.js';
import {
	createSystemWebhookInDatabase,
	deleteSystemWebhookFromDatabase,
	fetchSystemWebhookByIdOrFailFromDatabase,
	updateSystemWebhookInDatabase,
} from '@/core/webhook/SystemWebhookStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { ModerationLogPayloads } from '@/types.js';

export type SystemWebhookCreateOptions = Pick<MiSystemWebhook, 'isActive' | 'name' | 'on' | 'url' | 'secret'>;

export type SystemWebhookUpdateOptions = Pick<MiSystemWebhook, 'id' | 'isActive' | 'name' | 'on' | 'url' | 'secret'>;

export type SystemWebhookLogicDependencies = {
	db: MiDrizzleDatabase;
	genId: () => string;
	publishInternalEvent?:
		| (<K extends keyof InternalEventTypes>(type: K, value?: InternalEventTypes[K]) => void)
		| undefined;
	logModeration?: <T extends keyof ModerationLogPayloads>(
		moderator: { id: MiUser['id'] },
		type: T,
		info?: ModerationLogPayloads[T],
	) => void | Promise<void>;
};

export async function createSystemWebhookWithSideEffects(
	deps: SystemWebhookLogicDependencies,
	params: SystemWebhookCreateOptions,
	updater: MiUser,
): Promise<MiSystemWebhook> {
	const webhook = await createSystemWebhookInDatabase(deps.db, {
		...params,
		id: deps.genId(),
	});

	deps.publishInternalEvent?.('systemWebhookCreated', webhook);
	void deps.logModeration?.(updater, 'createSystemWebhook', {
		systemWebhookId: webhook.id,
		webhook,
	});

	return webhook;
}

export async function updateSystemWebhookWithSideEffects(
	deps: Omit<SystemWebhookLogicDependencies, 'genId'>,
	params: SystemWebhookUpdateOptions,
	updater: MiUser,
): Promise<MiSystemWebhook> {
	const before = await fetchSystemWebhookByIdOrFailFromDatabase(deps.db, params.id);
	const after = await updateSystemWebhookInDatabase(deps.db, before.id, {
		updatedAt: new Date(),
		isActive: params.isActive,
		name: params.name,
		on: params.on,
		url: params.url,
		secret: params.secret,
	});

	if (after == null) {
		throw new Error(`System webhook ${before.id} not found`);
	}

	deps.publishInternalEvent?.('systemWebhookUpdated', after);
	void deps.logModeration?.(updater, 'updateSystemWebhook', {
		systemWebhookId: before.id,
		before,
		after,
	});

	return after;
}

export async function deleteSystemWebhookWithSideEffects(
	deps: Omit<SystemWebhookLogicDependencies, 'genId'>,
	id: MiSystemWebhook['id'],
	updater: MiUser,
): Promise<void> {
	const webhook = await fetchSystemWebhookByIdOrFailFromDatabase(deps.db, id);
	await deleteSystemWebhookFromDatabase(deps.db, id);

	deps.publishInternalEvent?.('systemWebhookDeleted', webhook);
	void deps.logModeration?.(updater, 'deleteSystemWebhook', {
		systemWebhookId: webhook.id,
		webhook,
	});
}
