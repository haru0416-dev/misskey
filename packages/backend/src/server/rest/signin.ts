/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comparePassword } from '@/misc/password.js';
import type * as Misskey from 'misskey-js';
import type * as Redis from 'ioredis';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { createSigninInDatabase } from '@/core/account/SigninStore.js';
import { countUserSecurityKeysByUserIdFromDatabase } from '@/core/account/UserSecurityKeyStore.js';
import type { UserAuthService } from '@/core/account/UserAuthService.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { fetchLocalUserByUsernameFromDatabase } from '@/core/user/UserStore.js';
import type { WebAuthnService } from '@/core/account/WebAuthnService.js';
import type { EmailService } from '@/core/email/EmailService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiMeta } from '@/models/_.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiLocalUser } from '@/models/User.js';
import type Logger from '@/logger.js';
import { createLoginNotification, type HonoApiNotificationDependencies } from './notification.js';
import { isHonoApiRateLimited } from './rate-limit.js';
import type { HonoApiErrorBody, HonoApiErrorKind } from './error.js';

export type HonoApiSigninDependencies = HonoApiNotificationDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis.Redis;
	httpRequestService: HttpRequestService;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate'>;
	webAuthnService: Pick<
		WebAuthnService,
		| 'initiateAuthentication'
		| 'verifyAuthentication'
		| 'initiateSignInWithPasskeyAuthentication'
		| 'verifySignInWithPasskeyAuthentication'
	>;
	emailService: Pick<EmailService, 'sendEmail'>;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
};

type HonoApiSigninBody = Record<string, unknown> & {
	username?: unknown;
	password?: unknown;
	token?: unknown;
	credential?: unknown;
	context?: unknown;
	code?: unknown;
};

export type HonoApiSigninRequest = {
	body: HonoApiSigninBody;
	headers: Headers;
	ip: string;
};

export type HonoApiSigninErrorBody = HonoApiErrorBody;

export type HonoApiSigninFlowResult = {
	status: number;
	body?: Misskey.entities.SigninFlowResponse | HonoApiSigninErrorBody;
};

export type HonoApiSigninErrorResult = {
	status: number;
	body: HonoApiSigninErrorBody;
};

type CaptchaResponse = {
	success: boolean;
	'error-codes'?: string[];
};

export function honoApiSigninError(status: number, id: string): HonoApiSigninErrorResult {
	let message = 'Invalid param.';
	let code = 'INVALID_PARAM';
	let kind: HonoApiErrorKind = 'client';
	if (status === 403) {
		message = 'Authentication failed.';
		code = 'AUTHENTICATION_FAILED';
		kind = 'permission';
	} else if (status === 404) {
		message = 'No such user.';
		code = 'NO_SUCH_USER';
	}

	return {
		status,
		body: {
			error: { message, code, id, kind },
		},
	};
}

export function tooManyAuthenticationFailures(): HonoApiSigninErrorResult {
	return {
		status: 429,
		body: {
			error: {
				message: 'Too many failed attempts to sign in. Try again later.',
				code: 'TOO_MANY_AUTHENTICATION_FAILURES',
				id: '22d05606-fbcf-421a-a2db-b32610dcfd1b',
				kind: 'client',
			},
		},
	};
}

function headersObject(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

async function isSigninRateLimited(deps: HonoApiSigninDependencies, ip: string): Promise<boolean> {
	return await isHonoApiRateLimited(
		deps,
		{
			key: 'signin',
			duration: 60 * 60 * 1000,
			max: 10,
			minInterval: 1000,
		},
		getIpHash(ip),
	);
}

async function getCaptchaResponse(
	deps: HonoApiSigninDependencies,
	url: string,
	secret: string,
	response: string | null | undefined,
): Promise<CaptchaResponse> {
	if (response == null) {
		throw new Error('captcha response missing');
	}

	const params = new URLSearchParams({
		secret,
		response,
	});

	const res = await deps.httpRequestService.send(
		url,
		{
			method: 'POST',
			body: params.toString(),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		},
		{ throwErrorWhenResponseNotOk: false },
	);

	if (!res.ok) {
		throw new Error(`captcha request failed: ${res.status}`);
	}

	return (await res.json()) as CaptchaResponse;
}

async function verifyRecaptcha(
	deps: HonoApiSigninDependencies,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	const result = await getCaptchaResponse(deps, 'https://www.recaptcha.net/recaptcha/api/siteverify', secret, response);
	if (result.success !== true) {
		throw new Error(`recaptcha failed: ${result['error-codes']?.join(', ') ?? ''}`);
	}
}

async function verifyHcaptcha(
	deps: HonoApiSigninDependencies,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	const result = await getCaptchaResponse(deps, 'https://hcaptcha.com/siteverify', secret, response);
	if (result.success !== true) {
		throw new Error(`hcaptcha failed: ${result['error-codes']?.join(', ') ?? ''}`);
	}
}

async function verifyMcaptcha(
	deps: HonoApiSigninDependencies,
	secret: string,
	siteKey: string,
	instanceHost: string,
	response: string | null | undefined,
): Promise<void> {
	if (response == null) {
		throw new Error('mcaptcha response missing');
	}

	const endpointUrl = new URL('/api/v1/pow/siteverify', instanceHost);
	const result = await deps.httpRequestService.send(
		endpointUrl.toString(),
		{
			method: 'POST',
			body: JSON.stringify({
				key: siteKey,
				secret,
				token: response,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		},
		{ throwErrorWhenResponseNotOk: false },
	);

	if (result.status !== 200) {
		throw new Error('mcaptcha did not return 200 OK');
	}

	const resp = (await result.json()) as { valid: boolean };
	if (!resp.valid) {
		throw new Error('mcaptcha failed');
	}
}

async function verifyTurnstile(
	deps: HonoApiSigninDependencies,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	const result = await getCaptchaResponse(
		deps,
		'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		secret,
		response,
	);
	if (result.success !== true) {
		throw new Error(`turnstile failed: ${result['error-codes']?.join(', ') ?? ''}`);
	}
}

function verifyTestcaptcha(response: string | null | undefined): void {
	if (response !== 'testcaptcha-passed') {
		throw new Error('testcaptcha failed');
	}
}

async function verifyEnabledCaptchas(deps: HonoApiSigninDependencies, body: Record<string, unknown>): Promise<void> {
	if (process.env['NODE_ENV'] === 'test') return;

	if (deps.meta.enableHcaptcha && deps.meta.hcaptchaSecretKey) {
		await verifyHcaptcha(deps, deps.meta.hcaptchaSecretKey, body['hcaptcha-response'] as string | null | undefined);
	}

	if (
		deps.meta.enableMcaptcha &&
		deps.meta.mcaptchaSecretKey &&
		deps.meta.mcaptchaSitekey &&
		deps.meta.mcaptchaInstanceUrl
	) {
		await verifyMcaptcha(
			deps,
			deps.meta.mcaptchaSecretKey,
			deps.meta.mcaptchaSitekey,
			deps.meta.mcaptchaInstanceUrl,
			body['m-captcha-response'] as string | null | undefined,
		);
	}

	if (deps.meta.enableRecaptcha && deps.meta.recaptchaSecretKey) {
		await verifyRecaptcha(
			deps,
			deps.meta.recaptchaSecretKey,
			body['g-recaptcha-response'] as string | null | undefined,
		);
	}

	if (deps.meta.enableTurnstile && deps.meta.turnstileSecretKey) {
		await verifyTurnstile(deps, deps.meta.turnstileSecretKey, body['turnstile-response'] as string | null | undefined);
	}

	if (deps.meta.enableTestcaptcha) {
		verifyTestcaptcha(body['testcaptcha-response'] as string | null | undefined);
	}
}

function packSignin(config: Config, src: MiSignin): Record<string, unknown> {
	return {
		id: src.id,
		createdAt: parseId(src.id).date.toISOString(),
		ip: src.ip,
		headers: src.headers,
		success: src.success,
	};
}

async function appendFailedSignin(
	deps: HonoApiSigninDependencies,
	request: HonoApiSigninRequest,
	user: MiLocalUser,
): Promise<void> {
	await createSigninInDatabase(deps.db, {
		id: genId(),
		userId: user.id,
		ip: request.ip,
		headers: headersObject(request.headers),
		success: false,
	});
}

export function completeHonoApiSignin(
	deps: HonoApiSigninDependencies,
	request: HonoApiSigninRequest,
	user: MiLocalUser,
): HonoApiSigninFlowResult {
	trackPromise(
		(async () => {
			try {
				createLoginNotification(deps, user.id);

				const record = await createSigninInDatabase(deps.db, {
					id: genId(),
					userId: user.id,
					ip: request.ip,
					headers: headersObject(request.headers),
					success: true,
				});

				deps.publishMainStream?.(user.id, 'signin', packSignin(deps.config, record));

				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
				if (profile.email && profile.emailVerified) {
					await deps.emailService.sendEmail(
						profile.email,
						'New login / ログインがありました',
						'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
						'There is a new login. If you do not recognize this login, update the security status of your account, including changing your password. / 新しいログインがありました。このログインに心当たりがない場合は、パスワードを変更するなど、アカウントのセキュリティ状態を更新してください。',
					);
				}
			} catch (err) {
				deps.logger.error(err instanceof Error ? err : new Error(String(err)));
			}
		})(),
	);

	return {
		status: 200,
		body: {
			finished: true,
			id: user.id,
			i: user.token!,
		},
	};
}

export async function failHonoApiSignin(
	deps: HonoApiSigninDependencies,
	request: HonoApiSigninRequest,
	user: MiLocalUser,
	status: number,
	id: string,
): Promise<HonoApiSigninErrorResult> {
	await appendFailedSignin(deps, request, user);
	return honoApiSigninError(status, id);
}

export async function handleHonoApiSigninFlow(
	deps: HonoApiSigninDependencies,
	request: HonoApiSigninRequest,
): Promise<HonoApiSigninFlowResult> {
	const body = request.body;
	const username = body.username;
	const password = body.password;
	const token = body.token;

	if (await isSigninRateLimited(deps, request.ip)) {
		return tooManyAuthenticationFailures();
	}

	if (typeof username !== 'string') {
		return honoApiSigninError(400, '3d81ceae-475f-4600-b2a8-2bc116157532');
	}

	if (token != null && typeof token !== 'string') {
		return honoApiSigninError(400, '3d81ceae-475f-4600-b2a8-2bc116157532');
	}

	const user = await fetchLocalUserByUsernameFromDatabase(deps.db, username);

	if (user == null) {
		return honoApiSigninError(404, '6cc579cc-885d-43d8-95c2-b8c7fc963280');
	}

	if (user.isSuspended) {
		return honoApiSigninError(403, 'e03a5f46-d309-4865-9b69-56282d94e1eb');
	}

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const securityKeysAvailable = await countUserSecurityKeysByUserIdFromDatabase(deps.db, user.id).then(
		(result) => result >= 1,
	);

	if (password == null) {
		if (profile.twoFactorEnabled) {
			return {
				status: 200,
				body: {
					finished: false,
					next: 'password',
				},
			};
		}

		return {
			status: 200,
			body: {
				finished: false,
				next: 'captcha',
			},
		};
	}

	if (typeof password !== 'string') {
		return honoApiSigninError(400, '3d81ceae-475f-4600-b2a8-2bc116157532');
	}

	const same = await comparePassword(password, profile.password!);

	if (!profile.twoFactorEnabled) {
		try {
			await verifyEnabledCaptchas(deps, body);
		} catch {
			return honoApiSigninError(400, '3d81ceae-475f-4600-b2a8-2bc116157532');
		}

		if (same) {
			return completeHonoApiSignin(deps, request, user);
		}

		return await failHonoApiSignin(deps, request, user, 403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
	}

	if (token) {
		if (!same) {
			return await failHonoApiSignin(deps, request, user, 403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
		}

		try {
			await deps.userAuthService.twoFactorAuthenticate(profile, token);
		} catch {
			return await failHonoApiSignin(deps, request, user, 403, 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f');
		}

		return completeHonoApiSignin(deps, request, user);
	} else if (body.credential) {
		if (!same && !profile.usePasswordLessLogin) {
			return await failHonoApiSignin(deps, request, user, 403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
		}

		const authorized = await deps.webAuthnService.verifyAuthentication(
			user.id,
			body.credential as AuthenticationResponseJSON,
		);

		if (authorized) {
			return completeHonoApiSignin(deps, request, user);
		}

		return await failHonoApiSignin(deps, request, user, 403, '93b86c4b-72f9-40eb-9815-798928603d1e');
	} else if (securityKeysAvailable) {
		if (!same && !profile.usePasswordLessLogin) {
			return await failHonoApiSignin(deps, request, user, 403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
		}

		const authRequest = await deps.webAuthnService.initiateAuthentication(user.id);

		return {
			status: 200,
			body: {
				finished: false,
				next: 'passkey',
				authRequest,
			},
		};
	}

	if (!same || !profile.twoFactorEnabled) {
		return await failHonoApiSignin(deps, request, user, 403, '932c904e-9460-45b7-9ce6-7ed33be7eb2c');
	}

	return {
		status: 200,
		body: {
			finished: false,
			next: 'totp',
		},
	};
}
