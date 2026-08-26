/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	createSwSubscriptionInDatabase,
	deleteSwSubscriptionByEndpointFromDatabase,
	fetchSwSubscriptionFromDatabase,
	isDuplicateKeyValueDatabaseError,
	updateSwSubscriptionByUserAndEndpointInDatabase,
	updateSwSubscriptionInDatabase,
} from '@/core/sw/SwSubscriptionStore.js';
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
};

export const swRegisterParamDef = z.object({
	endpoint: z.string(),
	auth: z.string(),
	publickey: z.string(),
	sendReadMessage: z.boolean().default(false),
});

export const swShowRegistrationParamDef = z.object({
	endpoint: z.string(),
});

export const swUpdateRegistrationParamDef = z.object({
	endpoint: z.string(),
	sendReadMessage: z.boolean().optional(),
});

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

export async function handleHonoApiSwRegister(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwRegisterResponse> {
	const params = parseHonoApiParams(swRegisterParamDef, body);
	const exist = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (exist != null) {
		const isSameSubscription =
			exist.auth === params.auth &&
			exist.publickey === params.publickey &&
			exist.sendReadMessage === params.sendReadMessage;

		if (!isSameSubscription) {
			await updateSwSubscriptionInDatabase(deps.db, exist.id, {
				auth: params.auth,
				publickey: params.publickey,
				sendReadMessage: params.sendReadMessage,
			});
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
			id: genId(),
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
	const params = parseHonoApiParams(swShowRegistrationParamDef, body);
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
	const params = parseHonoApiParams(swShowRegistrationParamDef, body);
	await deleteSwSubscriptionByEndpointFromDatabase(deps.db, me?.id ?? null, params.endpoint);

	if (me != null) {
	}
}

export async function handleHonoApiSwUpdateRegistration(
	deps: HonoApiSwDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<SwShowRegistrationResponse> {
	const params = parseHonoApiParams(swUpdateRegistrationParamDef, body);
	const swSubscription = await fetchSwSubscriptionFromDatabase(deps.db, me.id, params.endpoint);

	if (swSubscription == null) {
		throw noSuchRegistrationError();
	}

	const sendReadMessage = params.sendReadMessage ?? swSubscription.sendReadMessage;

	await updateSwSubscriptionInDatabase(deps.db, swSubscription.id, {
		sendReadMessage,
	});

	return {
		userId: swSubscription.userId,
		endpoint: swSubscription.endpoint,
		sendReadMessage,
	};
}
