/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type * as Misskey from 'misskey-js';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { fetchLocalUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiUser } from '@/models/User.js';
import {
	completeApiSignin,
	failApiSignin,
	honoApiSigninError,
	type ApiSigninDependencies,
	type ApiSigninErrorBody,
	type ApiSigninRequest,
	tooManyAuthenticationFailures,
} from './signin.js';
import { isApiRateLimited } from '../rate-limit.js';

export type ApiSigninWithPasskeyResult = {
	status: number;
	body:
		| Misskey.entities.SigninWithPasskeyInitResponse
		| Misskey.entities.SigninWithPasskeyResponse
		| ApiSigninErrorBody;
};

async function isPasskeySigninRateLimited(deps: ApiSigninDependencies, ip: string): Promise<boolean> {
	return await isApiRateLimited(
		deps,
		{
			key: 'signin-with-passkey',
			duration: 60 * 30 * 1000,
			max: 200,
			minInterval: 250,
		},
		getIpHash(ip),
	);
}

function passkeySigninError(status: number, id: string): ApiSigninWithPasskeyResult {
	const result = honoApiSigninError(status, id);
	return {
		status: result.status,
		body: result.body!,
	};
}

export async function handleApiSigninWithPasskey(
	deps: ApiSigninDependencies,
	request: ApiSigninRequest,
): Promise<ApiSigninWithPasskeyResult> {
	const credential = request.body.credential as AuthenticationResponseJSON | undefined;

	if (await isPasskeySigninRateLimited(deps, request.ip)) {
		const result = tooManyAuthenticationFailures();
		return {
			status: result.status,
			body: result.body!,
		};
	}

	if (!credential) {
		const context = randomUUID();
		deps.logger.info(`Initiate Passkey challenge: context: ${context}`);
		return {
			status: 200,
			body: {
				option: await deps.webAuthnService.initiateSignInWithPasskeyAuthentication(context),
				context,
			},
		};
	}

	const context = request.body.context;
	if (!context || typeof context !== 'string') {
		return passkeySigninError(400, '1658cc2e-4495-461f-aee4-d403cdf073c1');
	}

	deps.logger.debug(`Try Sign-in with Passkey: context: ${context}`);

	let authorizedUserId: MiUser['id'] | null;
	try {
		authorizedUserId = await deps.webAuthnService.verifySignInWithPasskeyAuthentication(context, credential);
	} catch (err) {
		deps.logger.warn(`Passkey challenge Verify error! : ${err}`);
		const errorId = err instanceof IdentifiableError ? err.id : '4e30e80c-e338-45a0-8c8f-44455efa3b76';
		return passkeySigninError(403, errorId);
	}

	if (authorizedUserId == null) {
		return passkeySigninError(403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
	}

	const user = await fetchLocalUserByIdFromDatabase(deps.db, authorizedUserId);

	if (user == null) {
		return passkeySigninError(403, '652f899f-66d4-490e-993e-6606c8ec04c3');
	}

	if (user.isSuspended) {
		return passkeySigninError(403, 'e03a5f46-d309-4865-9b69-56282d94e1eb');
	}

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);

	if (!profile.usePasswordLessLogin) {
		const result = await failApiSignin(deps, request, user, 403, '2d84773e-f7b7-4d0b-8f72-bb69b584c912');
		return {
			status: result.status,
			body: result.body!,
		};
	}

	const signinResponse = completeApiSignin(deps, request, user);

	return {
		status: 200,
		body: {
			signinResponse: signinResponse.body as Misskey.entities.SigninFlowResponse & { finished: true },
		},
	};
}
