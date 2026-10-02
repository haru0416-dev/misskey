/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	createSwSubscriptionInDatabase,
	deleteSwSubscriptionByEndpointFromDatabase,
	fetchSwSubscriptionFromDatabase,
	isDuplicateKeyValueDatabaseError,
	updateSwSubscriptionByUserAndEndpointInDatabase,
	updateSwSubscriptionInDatabase,
} from '@/core/sw/sw-subscription-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiMeta } from '@/models/entities.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type SwDependencies = {
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

function noSuchRegistrationError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such registration.',
		code: 'NO_SUCH_REGISTRATION',
		id: ' b09d8066-8064-5613-efb6-0e963b21d012',
	});
}

function invalidEndpointError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'The push endpoint must be an absolute https URL.',
		code: 'INVALID_PUSH_ENDPOINT',
		id: 'ec2677a8-9988-44bd-8ee3-1b9fc12a0a4e',
	});
}

// 送信は SSRF 検査付きの HttpRequestService を通すが、登録の時点で https の絶対 URL 以外を弾いておく。
function assertValidPushEndpoint(endpoint: string): void {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw invalidEndpointError();
	}
	if (url.protocol !== 'https:') {
		throw invalidEndpointError();
	}
}

export async function handleApiSwRegister(
	deps: SwDependencies,
	me: MiLocalUser,
	params: Params<typeof swRegisterParamDef>,
): Promise<SwRegisterResponse> {
	assertValidPushEndpoint(params.endpoint);

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
		if (!isDuplicateKeyValueDatabaseError(err)) {
			throw err;
		}

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

export async function handleApiSwShowRegistration(
	deps: SwDependencies,
	me: MiLocalUser,
	params: Params<typeof swShowRegistrationParamDef>,
): Promise<SwShowRegistrationResponse | null> {
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

export async function handleApiSwUnregister(
	deps: SwDependencies,
	me: MiLocalUser | null,
	params: Params<typeof swShowRegistrationParamDef>,
): Promise<void> {
	await deleteSwSubscriptionByEndpointFromDatabase(deps.db, me?.id ?? null, params.endpoint);
}

export async function handleApiSwUpdateRegistration(
	deps: SwDependencies,
	me: MiLocalUser,
	params: Params<typeof swUpdateRegistrationParamDef>,
): Promise<SwShowRegistrationResponse> {
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
