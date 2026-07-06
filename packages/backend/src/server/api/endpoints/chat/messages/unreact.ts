/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { chatMessagesUnreactParamDef } from '@/server/rest/chat.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: 'c39ea42f-e3ca-428a-ad57-390e0a711595',
		},
	},
} as const;

export const paramDef = chatMessagesUnreactParamDef;
