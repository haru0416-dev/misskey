/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	accessDeniedError,
	accountMovedError,
	authenticationFailedError,
	credentialRequiredError,
	invalidJsonBody,
	invalidParamError,
	payloadTooLargeError,
	permissionDeniedError,
	rateLimitExceededError,
	rolePermissionDeniedError,
	userSuspendedError,
	type HonoApiError,
} from '../../rest/error.js';

function example(error: HonoApiError) {
	return { value: error.toBody() };
}

export const errors = {
	'400': {
		'INVALID_PARAM': example(invalidParamError()),
		'INVALID_JSON_BODY': example(invalidJsonBody()),
		'ACCESS_DENIED': example(accessDeniedError()),
	},
	'401': {
		'CREDENTIAL_REQUIRED': example(credentialRequiredError()),
		'AUTHENTICATION_FAILED': example(authenticationFailedError()),
	},
	'403': {
		'PERMISSION_DENIED': example(permissionDeniedError()),
		'ROLE_PERMISSION_DENIED': example(rolePermissionDeniedError()),
		'YOUR_ACCOUNT_SUSPENDED': example(userSuspendedError()),
		'YOUR_ACCOUNT_MOVED': example(accountMovedError()),
	},
	'413': {
		'PAYLOAD_TOO_LARGE': example(payloadTooLargeError()),
	},
	'429': {
		'RATE_LIMIT_EXCEEDED': example(rateLimitExceededError()),
	},
	'500': {
		'INTERNAL_ERROR': {
			value: {
				error: {
					message: 'Internal error occurred. Please contact us if the error persists.',
					code: 'INTERNAL_ERROR',
					id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
					kind: 'server' as const,
				},
			},
		},
	},
};
