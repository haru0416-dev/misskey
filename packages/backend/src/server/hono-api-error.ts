/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type HonoApiErrorKind = 'client' | 'server' | 'permission';

export type HonoApiErrorBody = {
	error: {
		message: string;
		code: string;
		id: string;
		kind: HonoApiErrorKind;
		info?: unknown;
	};
};

export class HonoApiError extends Error {
	public readonly status: number;
	public readonly code: string;
	public readonly id: string;
	public readonly kind: HonoApiErrorKind;
	public readonly headers: Record<string, string>;
	public readonly info?: unknown;

	constructor(params: {
		status: number;
		message: string;
		code: string;
		id: string;
		kind?: HonoApiErrorKind;
		headers?: Record<string, string>;
		info?: unknown;
	}) {
		super(params.message);
		this.status = params.status;
		this.code = params.code;
		this.id = params.id;
		this.kind = params.kind ?? 'client';
		this.headers = params.headers ?? {};
		this.info = params.info;
	}

	public toBody(): HonoApiErrorBody {
		return {
			error: {
				message: this.message,
				code: this.code,
				id: this.id,
				kind: this.kind,
				...(this.info === undefined ? {} : { info: this.info }),
			},
		};
	}
}

export function invalidJsonBody(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Invalid JSON body.',
		code: 'INVALID_PARAM',
		id: '0b5f1631-7c1a-41a6-b399-cce335f34d85',
	});
}

export function invalidParamError(info?: unknown): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Invalid param.',
		code: 'INVALID_PARAM',
		id: '3d81ceae-475f-4600-b2a8-2bc116157532',
		info,
	});
}

export function rateLimitExceededError(): HonoApiError {
	return new HonoApiError({
		status: 429,
		message: 'Rate limit exceeded. Please try again later.',
		code: 'RATE_LIMIT_EXCEEDED',
		id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
	});
}

export function credentialRequiredError(): HonoApiError {
	return new HonoApiError({
		status: 401,
		message: 'Credential required.',
		code: 'CREDENTIAL_REQUIRED',
		id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		headers: {
			'WWW-Authenticate': 'Bearer realm="Misskey"',
		},
	});
}

export function authenticationFailedError(): HonoApiError {
	const message = 'Authentication failed. Please ensure your token is correct.';
	return new HonoApiError({
		status: 401,
		message,
		code: 'AUTHENTICATION_FAILED',
		id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
		headers: {
			'WWW-Authenticate': `Bearer realm="Misskey", error="invalid_token", error_description="${message}"`,
		},
	});
}

export function permissionDeniedError(): HonoApiError {
	const message = 'Your app does not have the necessary permissions to use this endpoint.';
	return new HonoApiError({
		status: 403,
		message,
		code: 'PERMISSION_DENIED',
		id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
		kind: 'permission',
		headers: {
			'WWW-Authenticate': `Bearer realm="Misskey", error="insufficient_scope", error_description="${message}"`,
		},
	});
}

export function accessDeniedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e',
	});
}

export function userSuspendedError(): HonoApiError {
	return new HonoApiError({
		status: 403,
		message: 'Your account has been suspended.',
		code: 'YOUR_ACCOUNT_SUSPENDED',
		id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed6258370',
		kind: 'permission',
	});
}

export function accountMovedError(): HonoApiError {
	return new HonoApiError({
		status: 403,
		message: 'You have moved your account.',
		code: 'YOUR_ACCOUNT_MOVED',
		id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
		kind: 'permission',
	});
}

export function userDeletedError(): HonoApiError {
	return new HonoApiError({
		status: 403,
		message: 'User is deleted.',
		code: 'USER_IS_DELETED',
		id: 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a',
		kind: 'permission',
	});
}

export function signupValidationError(code: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: code,
		code,
		id: 'b973e8da-5e72-4efd-8de0-822ae5e4cfc7',
	});
}
