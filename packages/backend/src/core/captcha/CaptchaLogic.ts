/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import type { MiMeta } from '@/models/Meta.js';

export const supportedCaptchaProviders = ['none', 'hcaptcha', 'cap', 'recaptcha', 'turnstile', 'testcaptcha'] as const;
type CaptchaProvider = (typeof supportedCaptchaProviders)[number];

export const captchaErrorCodes = {
	invalidProvider: Symbol('invalidProvider'),
	invalidParameters: Symbol('invalidParameters'),
	noResponseProvided: Symbol('noResponseProvided'),
	requestFailed: Symbol('requestFailed'),
	verificationFailed: Symbol('verificationFailed'),
	unknown: Symbol('unknown'),
} as const;
export type CaptchaErrorCode = (typeof captchaErrorCodes)[keyof typeof captchaErrorCodes];

export type CaptchaSetting = {
	provider: CaptchaProvider;
	hcaptcha: {
		siteKey: string | null;
		secretKey: string | null;
	};
	cap: {
		siteKey: string | null;
		secretKey: string | null;
		instanceUrl: string | null;
	};
	recaptcha: {
		siteKey: string | null;
		secretKey: string | null;
	};
	turnstile: {
		siteKey: string | null;
		secretKey: string | null;
	};
};

export class CaptchaError extends Error {
	public readonly code: CaptchaErrorCode;
	public override readonly cause?: unknown;

	constructor(code: CaptchaErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
		this.name = 'CaptchaError';
	}
}

type CaptchaSaveSuccess = {
	success: true;
};
type CaptchaSaveFailure = {
	success: false;
	error: CaptchaError;
};
export type CaptchaSaveResult = CaptchaSaveSuccess | CaptchaSaveFailure;

type CaptchaResponse = {
	success: boolean;
	'error-codes'?: string[];
};

type CaptchaSaveParams = {
	sitekey?: string | null;
	secret?: string | null;
	instanceUrl?: string | null;
	captchaResult?: string | null;
};

type CaptchaMetaUpdate = Partial<
	Pick<
		MiMeta,
		| ('enableHcaptcha' | 'hcaptchaSiteKey' | 'hcaptchaSecretKey')
		| ('enableCap' | 'capSiteKey' | 'capSecretKey' | 'capInstanceUrl')
		| ('enableRecaptcha' | 'recaptchaSiteKey' | 'recaptchaSecretKey')
		| ('enableTurnstile' | 'turnstileSiteKey' | 'turnstileSecretKey')
		| 'enableTestcaptcha'
	>
>;

function isCaptchaProvider(value: string): value is CaptchaProvider {
	return supportedCaptchaProviders.includes(value as CaptchaProvider);
}

async function getCaptchaResponse(
	httpRequestService: Pick<HttpRequestService, 'send'>,
	url: string,
	secret: string,
	response: string,
): Promise<CaptchaResponse> {
	const params = new URLSearchParams({
		secret,
		response,
	});

	const res = await httpRequestService.send(
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
		throw new Error(`${res.status}`);
	}

	return (await res.json()) as CaptchaResponse;
}

export async function verifyRecaptcha(
	httpRequestService: Pick<HttpRequestService, 'send'>,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	if (response == null) {
		throw new CaptchaError(captchaErrorCodes.noResponseProvided, 'recaptcha-failed: no response provided');
	}

	const result = await getCaptchaResponse(
		httpRequestService,
		'https://www.recaptcha.net/recaptcha/api/siteverify',
		secret,
		response,
	).catch((err) => {
		throw new CaptchaError(captchaErrorCodes.requestFailed, `recaptcha-request-failed: ${err}`);
	});

	if (result.success !== true) {
		const errorCodes = result['error-codes'] ? result['error-codes'].join(', ') : '';
		throw new CaptchaError(captchaErrorCodes.verificationFailed, `recaptcha-failed: ${errorCodes}`);
	}
}

export async function verifyHcaptcha(
	httpRequestService: Pick<HttpRequestService, 'send'>,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	if (response == null) {
		throw new CaptchaError(captchaErrorCodes.noResponseProvided, 'hcaptcha-failed: no response provided');
	}

	const result = await getCaptchaResponse(
		httpRequestService,
		'https://hcaptcha.com/siteverify',
		secret,
		response,
	).catch((err) => {
		throw new CaptchaError(captchaErrorCodes.requestFailed, `hcaptcha-request-failed: ${err}`);
	});

	if (result.success !== true) {
		const errorCodes = result['error-codes'] ? result['error-codes'].join(', ') : '';
		throw new CaptchaError(captchaErrorCodes.verificationFailed, `hcaptcha-failed: ${errorCodes}`);
	}
}

export async function verifyCap(
	httpRequestService: Pick<HttpRequestService, 'send'>,
	secret: string,
	siteKey: string,
	instanceHost: string,
	response: string | null | undefined,
): Promise<void> {
	if (typeof response !== 'string' || response.length === 0) {
		throw new CaptchaError(captchaErrorCodes.noResponseProvided, 'cap-failed: no response provided');
	}

	const endpointUrl = new URL(`${encodeURIComponent(siteKey)}/siteverify`, `${instanceHost.replace(/\/$/, '')}/`);
	const result = await httpRequestService.send(
		endpointUrl.toString(),
		{
			method: 'POST',
			body: JSON.stringify({
				secret: secret,
				response: response,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		},
		{ throwErrorWhenResponseNotOk: false },
	);

	if (result.status !== 200) {
		throw new CaptchaError(captchaErrorCodes.requestFailed, "cap-failed: cap didn't return 200 OK");
	}

	const resp = (await result.json()) as { success: boolean };

	if (resp.success !== true) {
		throw new CaptchaError(captchaErrorCodes.verificationFailed, 'cap-request-failed');
	}
}

export async function verifyTurnstile(
	httpRequestService: Pick<HttpRequestService, 'send'>,
	secret: string,
	response: string | null | undefined,
): Promise<void> {
	if (response == null) {
		throw new CaptchaError(captchaErrorCodes.noResponseProvided, 'turnstile-failed: no response provided');
	}

	const result = await getCaptchaResponse(
		httpRequestService,
		'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		secret,
		response,
	).catch((err) => {
		throw new CaptchaError(captchaErrorCodes.requestFailed, `turnstile-request-failed: ${err}`);
	});

	if (result.success !== true) {
		const errorCodes = result['error-codes'] ? result['error-codes'].join(', ') : '';
		throw new CaptchaError(captchaErrorCodes.verificationFailed, `turnstile-failed: ${errorCodes}`);
	}
}

export async function verifyTestcaptcha(response: string | null | undefined): Promise<void> {
	if (response == null) {
		throw new CaptchaError(captchaErrorCodes.noResponseProvided, 'testcaptcha-failed: no response provided');
	}

	if (response !== 'testcaptcha-passed') {
		throw new CaptchaError(captchaErrorCodes.verificationFailed, 'testcaptcha-failed');
	}
}

export function getCaptchaSetting(meta: MiMeta): CaptchaSetting {
	let provider: CaptchaProvider;
	switch (true) {
		case meta.enableHcaptcha:
			provider = 'hcaptcha';
			break;
		case meta.enableCap:
			provider = 'cap';
			break;
		case meta.enableRecaptcha:
			provider = 'recaptcha';
			break;
		case meta.enableTurnstile:
			provider = 'turnstile';
			break;
		case meta.enableTestcaptcha:
			provider = 'testcaptcha';
			break;
		default:
			provider = 'none';
			break;
	}

	return {
		provider,
		hcaptcha: {
			siteKey: meta.hcaptchaSiteKey,
			secretKey: meta.hcaptchaSecretKey,
		},
		cap: {
			siteKey: meta.capSiteKey,
			secretKey: meta.capSecretKey,
			instanceUrl: meta.capInstanceUrl,
		},
		recaptcha: {
			siteKey: meta.recaptchaSiteKey,
			secretKey: meta.recaptchaSecretKey,
		},
		turnstile: {
			siteKey: meta.turnstileSiteKey,
			secretKey: meta.turnstileSecretKey,
		},
	};
}

function buildCaptchaMetaUpdate(provider: CaptchaProvider, params?: CaptchaSaveParams): CaptchaMetaUpdate {
	const metaPartial: CaptchaMetaUpdate = {
		enableHcaptcha: provider === 'hcaptcha',
		enableCap: provider === 'cap',
		enableRecaptcha: provider === 'recaptcha',
		enableTurnstile: provider === 'turnstile',
		enableTestcaptcha: provider === 'testcaptcha',
	};

	const updateIfNotUndefined = <K extends keyof typeof metaPartial>(key: K, value: (typeof metaPartial)[K]) => {
		if (value !== undefined) {
			metaPartial[key] = value;
		}
	};

	switch (provider) {
		case 'hcaptcha':
			updateIfNotUndefined('hcaptchaSiteKey', params?.sitekey);
			updateIfNotUndefined('hcaptchaSecretKey', params?.secret);
			break;
		case 'cap':
			updateIfNotUndefined('capSiteKey', params?.sitekey);
			updateIfNotUndefined('capSecretKey', params?.secret);
			updateIfNotUndefined('capInstanceUrl', params?.instanceUrl);
			break;
		case 'recaptcha':
			updateIfNotUndefined('recaptchaSiteKey', params?.sitekey);
			updateIfNotUndefined('recaptchaSecretKey', params?.secret);
			break;
		case 'turnstile':
			updateIfNotUndefined('turnstileSiteKey', params?.sitekey);
			updateIfNotUndefined('turnstileSecretKey', params?.secret);
			break;
	}

	return metaPartial;
}

export async function saveCaptchaSetting(
	deps: {
		httpRequestService: Pick<HttpRequestService, 'send'>;
		updateMeta: (data: CaptchaMetaUpdate) => Promise<void>;
		logger?: Pick<Console, 'info'>;
	},
	provider: string,
	params?: CaptchaSaveParams,
): Promise<CaptchaSaveResult> {
	if (!isCaptchaProvider(provider)) {
		return {
			success: false,
			error: new CaptchaError(captchaErrorCodes.invalidProvider, `Invalid captcha provider: ${provider}`),
		};
	}

	const operation = {
		none: async () => {
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
		hcaptcha: async () => {
			if (!params?.secret || !params.captchaResult) {
				throw new CaptchaError(
					captchaErrorCodes.invalidParameters,
					'hcaptcha-failed: secret and captureResult are required',
				);
			}

			await verifyHcaptcha(deps.httpRequestService, params.secret, params.captchaResult);
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
		cap: async () => {
			if (!params?.secret || !params.sitekey || !params.instanceUrl || !params.captchaResult) {
				throw new CaptchaError(
					captchaErrorCodes.invalidParameters,
					'cap-failed: secret, sitekey, instanceUrl and captureResult are required',
				);
			}

			await verifyCap(deps.httpRequestService, params.secret, params.sitekey, params.instanceUrl, params.captchaResult);
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
		recaptcha: async () => {
			if (!params?.secret || !params.captchaResult) {
				throw new CaptchaError(
					captchaErrorCodes.invalidParameters,
					'recaptcha-failed: secret and captureResult are required',
				);
			}

			await verifyRecaptcha(deps.httpRequestService, params.secret, params.captchaResult);
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
		turnstile: async () => {
			if (!params?.secret || !params.captchaResult) {
				throw new CaptchaError(
					captchaErrorCodes.invalidParameters,
					'turnstile-failed: secret and captureResult are required',
				);
			}

			await verifyTurnstile(deps.httpRequestService, params.secret, params.captchaResult);
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
		testcaptcha: async () => {
			if (!params?.captchaResult) {
				throw new CaptchaError(captchaErrorCodes.invalidParameters, 'turnstile-failed: captureResult are required');
			}

			await verifyTestcaptcha(params.captchaResult);
			await deps.updateMeta(buildCaptchaMetaUpdate(provider, params));
		},
	}[provider];

	return operation()
		.then(() => ({ success: true }) as CaptchaSaveSuccess)
		.catch((err) => {
			deps.logger?.info(err);
			const error =
				err instanceof CaptchaError ? err : new CaptchaError(captchaErrorCodes.unknown, `unknown error: ${err}`);
			return {
				success: false,
				error,
			};
		});
}
