/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import {
	createSwSubscriptionInDatabase,
	deleteSwSubscriptionByEndpointFromDatabase,
	fetchSwSubscriptionFromDatabase,
	isDuplicateKeyValueDatabaseError,
	listSwSubscriptionsByUserIdFromDatabase,
	updateSwSubscriptionByUserAndEndpointInDatabase,
	updateSwSubscriptionInDatabase,
} from '@/core/SwSubscriptionStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiSwDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis.Redis;
};

const swRegisterParamDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
		auth: { type: 'string' },
		publickey: { type: 'string' },
		sendReadMessage: { type: 'boolean', default: false },
	},
	required: ['endpoint', 'auth', 'publickey'],
} as const;

const swShowRegistrationParamDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;

const swUpdateRegistrationParamDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
		sendReadMessage: { type: 'boolean' },
	},
	required: ['endpoint'],
} as const;

type SwRegisterParams = {
	endpoint: string;
	auth: string;
	publickey: string;
	sendReadMessage: boolean;
};

type SwShowRegistrationParams = {
	endpoint: string;
};

type SwUpdateRegistrationParams = {
	endpoint: string;
	sendReadMessage?: boolean;
};

type SwRegisterResponse = {
	state: 'already-subscribed' | 'subscribed';
	key: string | null;
	userId: string;
	endpoint: string;
	sendReadMessage: boolean;
};

type SwShowRegistrationResponse = {
	userId: string;
	endpoint: string;
	sendReadMessage: boolean;
};

function noSuchRegistrationError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such registration.',
		code: 'NO_SUCH_REGISTRATION',
		id: ' b09d8066-8064-5613-efb6-0e963b21d012',
	});
}

async function refreshSwSubscriptionsCache(
	deps: HonoApiSwDependencies,
	userId: MiLocalUser['id'],
): Promise<void> {
	const subscriptions = await listSwSubscriptionsByUserIdFromDatabase(deps.db, userId);
	await deps.redis.set(
		`kvcache:userSwSubscriptions:${userId}`,
		JSON.stringify(subscriptions),
		'EX',
		60 * 60,
	);
}

export async function handleHonoApiSwRegister(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwRegisterResponse> {
	const params = parseHonoApiParams(swRegisterParamDef, body) as SwRegisterParams;
	const exist = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (exist != null) {
		const isSameSubscription = exist.auth === params.auth
			&& exist.publickey === params.publickey
			&& exist.sendReadMessage === params.sendReadMessage;

		if (!isSameSubscription) {
			await updateSwSubscriptionInDatabase(deps.db, exist.id, {
				auth: params.auth,
				publickey: params.publickey,
				sendReadMessage: params.sendReadMessage,
			});
			await refreshSwSubscriptionsCache(deps, me.id);
		}

		return {
			state: isSameSubscription ? 'already-subscribed' : 'subscribed',
			key: deps.meta.swPublicKey,
			userId: me.id,
			endpoint: params.endpoint,
			sendReadMessage: params.sendReadMessage,
		};
	}

	try {
		await createSwSubscriptionInDatabase(deps.db, {
			id: genId(deps.config),
			userId: me.id,
			endpoint: params.endpoint,
			auth: params.auth,
			publickey: params.publickey,
			sendReadMessage: params.sendReadMessage,
		});
	} catch (err) {
		if (!isDuplicateKeyValueDatabaseError(err)) throw err;

		await updateSwSubscriptionByUserAndEndpointInDatabase(deps.db, me.id, params.endpoint, {
			auth: params.auth,
			publickey: params.publickey,
			sendReadMessage: params.sendReadMessage,
		});
	}

	await refreshSwSubscriptionsCache(deps, me.id);

	return {
		state: 'subscribed',
		key: deps.meta.swPublicKey,
		userId: me.id,
		endpoint: params.endpoint,
		sendReadMessage: params.sendReadMessage,
	};
}

export async function handleHonoApiSwShowRegistration(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwShowRegistrationResponse | null> {
	const params = parseHonoApiParams(swShowRegistrationParamDef, body) as SwShowRegistrationParams;
	const exist = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (exist == null) {
		return null;
	}

	return {
		userId: exist.userId,
		endpoint: exist.endpoint,
		sendReadMessage: exist.sendReadMessage,
	};
}

export async function handleHonoApiSwUnregister(
	deps: HonoApiSwDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(swShowRegistrationParamDef, body) as SwShowRegistrationParams;
	await deleteSwSubscriptionByEndpointFromDatabase(deps.db, me?.id ?? null, params.endpoint);

	if (me != null) {
		await refreshSwSubscriptionsCache(deps, me.id);
	}
}

export async function handleHonoApiSwUpdateRegistration(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwShowRegistrationResponse> {
	const params = parseHonoApiParams(swUpdateRegistrationParamDef, body) as SwUpdateRegistrationParams;
	const swSubscription = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (swSubscription == null) {
		throw noSuchRegistrationError();
	}

	const sendReadMessage = params.sendReadMessage ?? swSubscription.sendReadMessage;

	await updateSwSubscriptionInDatabase(deps.db, swSubscription.id, {
		sendReadMessage,
	});
	await refreshSwSubscriptionsCache(deps, me.id);

	return {
		userId: swSubscription.userId,
		endpoint: swSubscription.endpoint,
		sendReadMessage,
	};
}
