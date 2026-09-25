/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedNoteFavoriteSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		note: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'Note',
		},
		noteId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
	},
} as const;
