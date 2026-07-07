/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUserMaintenanceParamDef } from '@/server/rest/admin-user-maintenance.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:reset-password',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
		},
		cannotResetPasswordOfRootUser: {
			message: 'Cannot reset password of the root user.',
			code: 'CANNOT_RESET_PASSWORD_OF_ROOT_USER',
			id: 'f28fc207-42ca-44c7-a577-44b4f0ec5999',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			password: {
				type: 'string',
				optional: false, nullable: false,
				minLength: 8,
				maxLength: 8,
			},
		},
	},
} as const;

export const paramDef = adminUserMaintenanceParamDef;
