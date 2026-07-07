/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inviteDeleteParamDef } from '@/server/rest/invite.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	requiredRolePolicy: 'canInvite',
	kind: 'write:invite-codes',

	errors: {
		noSuchCode: {
			message: 'No such invite code.',
			code: 'NO_SUCH_INVITE_CODE',
			id: 'cd4f9ae4-7854-4e3e-8df9-c296f051e634',
		},

		cantDelete: {
			message: 'You can\'t delete this invite code.',
			code: 'CAN_NOT_DELETE_INVITE_CODE',
			id: 'ff17af39-000c-4d4e-abdf-848fa30fc1ce',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '5eb8d909-2540-4970-90b8-dd6f86088121',
		},
	},
} as const;

export const paramDef = inviteDeleteParamDef;
