/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedDriveFolderSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		name: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		parentId: {
			type: 'string',
			optional: false,
			nullable: true,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		foldersCount: {
			type: 'number',
			optional: true,
			nullable: false,
		},
		filesCount: {
			type: 'number',
			optional: true,
			nullable: false,
		},
		parent: {
			type: 'object',
			optional: true,
			nullable: true,
			ref: 'DriveFolder',
		},
	},
} as const;
