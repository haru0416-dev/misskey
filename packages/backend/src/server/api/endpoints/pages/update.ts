/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { pageNameSchema } from '@/models/Page.js';

export const meta = {
	tags: ['pages'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:pages',

	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	errors: {
		noSuchPage: {
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: '21149b9e-3616-4778-9592-c4ce89f5a864',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '3c15cd52-3b4b-4274-967d-6456fc4f792b',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'cfc23c7c-3887-490e-af30-0ed576703c82',
		},
		nameAlreadyExists: {
			message: 'Specified name already exists.',
			code: 'NAME_ALREADY_EXISTS',
			id: '2298a392-d4a1-44c5-9ebb-ac1aeaa5a9ab',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		pageId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string' },
		name: { ...pageNameSchema, minLength: 1 },
		summary: { type: 'string', nullable: true },
		content: { type: 'array', items: {
			type: 'object', additionalProperties: true,
		} },
		variables: { type: 'array', items: {
			type: 'object', additionalProperties: true,
		} },
		script: { type: 'string' },
		eyeCatchingImageId: { type: 'string', format: 'misskey:id', nullable: true },
		font: { type: 'string', enum: ['serif', 'sans-serif'] },
		alignCenter: { type: 'boolean' },
		hideTitleWhenPinned: { type: 'boolean' },
	},
	required: ['pageId'],
} as const;
