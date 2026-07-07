/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminDriveShowFileDocsParamDef } from '@/server/rest/admin-drive.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:drive',

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'caf3ca38-c6e5-472e-a30c-b05377dcc240',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
				example: 'xxxxxxxxxx',
			},
			createdAt: {
				type: 'string',
				optional: false, nullable: false,
				format: 'date-time',
			},
			userId: {
				type: 'string',
				optional: false, nullable: true,
				format: 'id',
				example: 'xxxxxxxxxx',
			},
			userHost: {
				type: 'string',
				optional: false, nullable: true,
				description: 'The local host is represented with `null`.',
			},
			md5: {
				type: 'string',
				optional: false, nullable: false,
				format: 'md5',
				example: '15eca7fba0480996e2245f5185bf39f2',
			},
			name: {
				type: 'string',
				optional: false, nullable: false,
				example: '192.jpg',
			},
			type: {
				type: 'string',
				optional: false, nullable: false,
				example: 'image/jpeg',
			},
			size: {
				type: 'number',
				optional: false, nullable: false,
				example: 51469,
			},
			comment: {
				type: 'string',
				optional: false, nullable: true,
			},
			blurhash: {
				type: 'string',
				optional: false, nullable: true,
			},
			properties: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					width: {
						type: 'number',
						optional: true, nullable: false,
					},
					height: {
						type: 'number',
						optional: true, nullable: false,
					},
					orientation: {
						type: 'number',
						optional: true, nullable: false,
					},
					avgColor: {
						type: 'string',
						optional: true, nullable: false,
					},
				},
			},
			storedInternal: {
				type: 'boolean',
				optional: false, nullable: true,
				example: true,
			},
			url: {
				type: 'string',
				optional: false, nullable: true,
				format: 'url',
			},
			thumbnailUrl: {
				type: 'string',
				optional: false, nullable: true,
				format: 'url',
			},
			webpublicUrl: {
				type: 'string',
				optional: false, nullable: true,
				format: 'url',
			},
			accessKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			thumbnailAccessKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			webpublicAccessKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			uri: {
				type: 'string',
				optional: false, nullable: true,
			},
			src: {
				type: 'string',
				optional: false, nullable: true,
			},
			folderId: {
				type: 'string',
				optional: false, nullable: true,
				format: 'id',
				example: 'xxxxxxxxxx',
			},
			isSensitive: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isLink: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			maybeSensitive: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			maybePorn: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			requestIp: {
				type: 'string',
				optional: false, nullable: true,
			},
			requestHeaders: {
				type: 'object',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = adminDriveShowFileDocsParamDef;
