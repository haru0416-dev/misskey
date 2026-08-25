/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { flashParamDef } from '@/server/rest/favorites.js';
import {
	flashCreateParamDef,
	flashDeleteParamDef,
	flashFeaturedParamDef,
	flashMyLikesParamDef,
	flashMyParamDef,
	flashSearchParamDef,
	flashShowParamDef,
	flashUpdateParamDef,
} from '@/server/rest/flash.js';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	'flash/create': {
		meta: {
			tags: ['flash'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:flash',

			limit: {
				duration: HOUR,
				max: 10,
			},

			errors: {},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Flash',
			},
		} as const,
		paramDef: flashCreateParamDef,
	},
	'flash/delete': {
		meta: {
			tags: ['flashs'],

			requireCredential: true,

			kind: 'write:flash',

			errors: {
				noSuchFlash: {
					message: 'No such flash.',
					code: 'NO_SUCH_FLASH',
					id: 'de1623ef-bbb3-4289-a71e-14cfa83d9740',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '1036ad7b-9f92-4fff-89c3-0e50dc941704',
				},
			},
		} as const,
		paramDef: flashDeleteParamDef,
	},
	'flash/featured': {
		meta: {
			allowQuery: true,
			tags: ['flash'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Flash',
				},
			},
		} as const,
		paramDef: flashFeaturedParamDef,
	},
	'flash/like': {
		meta: {
			tags: ['flash'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:flash-likes',

			errors: {
				noSuchFlash: {
					message: 'No such flash.',
					code: 'NO_SUCH_FLASH',
					id: 'c07c1491-9161-4c5c-9d75-01906f911f73',
				},

				yourFlash: {
					message: 'You cannot like your flash.',
					code: 'YOUR_FLASH',
					id: '3fd8a0e7-5955-4ba9-85bb-bf3e0c30e13b',
				},

				alreadyLiked: {
					message: 'The flash has already been liked.',
					code: 'ALREADY_LIKED',
					id: '010065cf-ad43-40df-8067-abff9f4686e3',
				},
			},
		} as const,
		paramDef: flashParamDef,
	},
	'flash/my': {
		meta: {
			tags: ['account', 'flash'],

			requireCredential: true,

			kind: 'read:flash',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Flash',
				},
			},
		} as const,
		paramDef: flashMyParamDef,
	},
	'flash/my-likes': {
		meta: {
			tags: ['account', 'flash'],

			requireCredential: true,

			kind: 'read:flash-likes',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							optional: false,
							nullable: false,
							format: 'id',
						},
						flash: {
							type: 'object',
							optional: false,
							nullable: false,
							ref: 'Flash',
						},
					},
				},
			},
		} as const,
		paramDef: flashMyLikesParamDef,
	},
	'flash/show': {
		meta: {
			allowQuery: true,
			tags: ['flashs'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Flash',
			},

			errors: {
				noSuchFlash: {
					message: 'No such flash.',
					code: 'NO_SUCH_FLASH',
					id: 'f0d34a1a-d29a-401d-90ba-1982122b5630',
				},
			},
		} as const,
		paramDef: flashShowParamDef,
	},
	'flash/unlike': {
		meta: {
			tags: ['flash'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:flash-likes',

			errors: {
				noSuchFlash: {
					message: 'No such flash.',
					code: 'NO_SUCH_FLASH',
					id: 'afe8424a-a69e-432d-a5f2-2f0740c62410',
				},

				notLiked: {
					message: 'You have not liked that flash.',
					code: 'NOT_LIKED',
					id: '755f25a7-9871-4f65-9f34-51eaad9ae0ac',
				},
			},
		} as const,
		paramDef: flashParamDef,
	},
	'flash/update': {
		meta: {
			tags: ['flash'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:flash',

			limit: {
				duration: HOUR,
				max: 300,
			},

			errors: {
				noSuchFlash: {
					message: 'No such flash.',
					code: 'NO_SUCH_FLASH',
					id: '611e13d2-309e-419a-a5e4-e0422da39b02',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '08e60c88-5948-478e-a132-02ec701d67b2',
				},
			},
		} as const,
		paramDef: flashUpdateParamDef,
	},
	'flash/search': {
		meta: {
			allowQuery: true,
			tags: ['flash'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Flash',
				},
			},
		} as const,
		paramDef: flashSearchParamDef,
	},
} as const;
