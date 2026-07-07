/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { driveFilesAttachedChatMessagesParamDef } from '@/server/rest/drive-files.js';

export const meta = {
	tags: ['drive', 'chat'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatMessage',
		},
	},

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '485ce26d-f5d2-4313-9783-e689d131eafb',
		},
	},
} as const;

export const paramDef = driveFilesAttachedChatMessagesParamDef;
