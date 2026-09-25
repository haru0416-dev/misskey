/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { editableUserContentHeaderProperties, optionalAttachmentProperties } from '@/models/json-schema/common.js';

export const packedGalleryPostSchema = {
	type: 'object',
	properties: {
		...editableUserContentHeaderProperties,
		title: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		description: {
			type: 'string',
			optional: false,
			nullable: true,
		},
		...optionalAttachmentProperties,
		isSensitive: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		likedCount: {
			type: 'number',
			optional: false,
			nullable: false,
		},
		isLiked: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
	},
} as const;
