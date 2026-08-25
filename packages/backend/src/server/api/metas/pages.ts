/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pageParamDef } from '@/server/rest/favorites.js';
import {
	pagesCreateParamDef,
	pagesDeleteParamDef,
	pagesFeaturedParamDef,
	pagesShowParamDef,
	pagesUpdateParamDef,
} from '@/server/rest/pages.js';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	'pages/create': {
		meta: {
			tags: ['pages'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:pages',

			limit: {
				duration: HOUR,
				max: 10,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
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
		} as const,
		paramDef: pagesCreateParamDef,
	},
	'pages/delete': {
		meta: {
			tags: ['pages'],

			requireCredential: true,

			kind: 'write:pages',

			errors: {
				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: 'eb0c6e1d-d519-4764-9486-52a7e1c6392a',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '8b741b3e-2c22-44b3-a15f-29949aa1601e',
				},
			},
		} as const,
		paramDef: pagesDeleteParamDef,
	},
	'pages/featured': {
		meta: {
			allowQuery: true,
			tags: ['pages'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Page',
				},
			},
		} as const,
		paramDef: pagesFeaturedParamDef,
	},
	'pages/like': {
		meta: {
			tags: ['pages'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:page-likes',

			errors: {
				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: 'cc98a8a2-0dc3-4123-b198-62c71df18ed3',
				},

				yourPage: {
					message: 'You cannot like your page.',
					code: 'YOUR_PAGE',
					id: '28800466-e6db-40f2-8fae-bf9e82aa92b8',
				},

				alreadyLiked: {
					message: 'The page has already been liked.',
					code: 'ALREADY_LIKED',
					id: 'd4c1edbe-7da2-4eae-8714-1acfd2d63941',
				},
			},
		} as const,
		paramDef: pageParamDef,
	},
	'pages/show': {
		meta: {
			allowQuery: true,
			tags: ['pages'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Page',
			},

			errors: {
				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: '222120c0-3ead-4528-811b-b96f233388d7',
				},
			},
		} as const,
		paramDef: pagesShowParamDef,
	},
	'pages/unlike': {
		meta: {
			tags: ['pages'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:page-likes',

			errors: {
				noSuchPage: {
					message: 'No such page.',
					code: 'NO_SUCH_PAGE',
					id: 'a0d41e20-1993-40bd-890e-f6e560ae648e',
				},

				notLiked: {
					message: 'You have not liked that page.',
					code: 'NOT_LIKED',
					id: 'f5e586b0-ce93-4050-b0e3-7f31af5259ee',
				},
			},
		} as const,
		paramDef: pageParamDef,
	},
	'pages/update': {
		meta: {
			tags: ['pages'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:pages',

			limit: {
				duration: HOUR,
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
		} as const,
		paramDef: pagesUpdateParamDef,
	},
} as const;
