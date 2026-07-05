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
		max: 10,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Page',
	},

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b7b97489-0f66-4b12-a5ff-b21bd63f6e1c',
		},
		nameAlreadyExists: {
			message: 'Specified name already exists.',
			code: 'NAME_ALREADY_EXISTS',
			id: '4650348e-301c-499a-83c9-6aa988c66bc1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
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
		font: { type: 'string', enum: ['serif', 'sans-serif'], default: 'sans-serif' },
		alignCenter: { type: 'boolean', default: false },
		hideTitleWhenPinned: { type: 'boolean', default: false },
	},
	required: ['title', 'name', 'content', 'variables', 'script'],
} as const;
