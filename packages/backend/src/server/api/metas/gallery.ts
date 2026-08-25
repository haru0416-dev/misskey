/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	galleryFeaturedParamDef,
	galleryPopularParamDef,
	galleryPostsCreateParamDef,
	galleryPostsParamDef,
	galleryPostsPostIdParamDef,
	galleryPostsUpdateParamDef,
} from '@/server/rest/gallery.js';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	'gallery/featured': {
		meta: {
			allowQuery: true,
			tags: ['gallery'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'GalleryPost',
				},
			},
		} as const,
		paramDef: galleryFeaturedParamDef,
	},
	'gallery/popular': {
		meta: {
			tags: ['gallery'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'GalleryPost',
				},
			},
		} as const,
		paramDef: galleryPopularParamDef,
	},
	'gallery/posts': {
		meta: {
			tags: ['gallery'],

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'GalleryPost',
				},
			},
		} as const,
		paramDef: galleryPostsParamDef,
	},
	'gallery/posts/create': {
		meta: {
			tags: ['gallery'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:gallery',

			limit: {
				duration: HOUR,
				max: 20,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'GalleryPost',
			},

			errors: {},
		} as const,
		paramDef: galleryPostsCreateParamDef,
	},
	'gallery/posts/delete': {
		meta: {
			tags: ['gallery'],

			requireCredential: true,

			kind: 'write:gallery',

			errors: {
				noSuchPost: {
					message: 'No such post.',
					code: 'NO_SUCH_POST',
					id: 'ae52f367-4bd7-4ecd-afc6-5672fff427f5',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: 'c86e09de-1c48-43ac-a435-1c7e42ed4496',
				},
			},
		} as const,
		paramDef: galleryPostsPostIdParamDef,
	},
	'gallery/posts/like': {
		meta: {
			tags: ['gallery'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:gallery-likes',

			errors: {
				noSuchPost: {
					message: 'No such post.',
					code: 'NO_SUCH_POST',
					id: '56c06af3-1287-442f-9701-c93f7c4a62ff',
				},

				yourPost: {
					message: 'You cannot like your post.',
					code: 'YOUR_POST',
					id: 'f78f1511-5ebc-4478-a888-1198d752da68',
				},

				alreadyLiked: {
					message: 'The post has already been liked.',
					code: 'ALREADY_LIKED',
					id: '40e9ed56-a59c-473a-bf3f-f289c54fb5a7',
				},
			},
		} as const,
		paramDef: galleryPostsPostIdParamDef,
	},
	'gallery/posts/show': {
		meta: {
			allowQuery: true,
			tags: ['gallery'],

			requireCredential: false,

			errors: {
				noSuchPost: {
					message: 'No such post.',
					code: 'NO_SUCH_POST',
					id: '1137bf14-c5b0-4604-85bb-5b5371b1cd45',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'GalleryPost',
			},
		} as const,
		paramDef: galleryPostsPostIdParamDef,
	},
	'gallery/posts/unlike': {
		meta: {
			tags: ['gallery'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:gallery-likes',

			errors: {
				noSuchPost: {
					message: 'No such post.',
					code: 'NO_SUCH_POST',
					id: 'c32e6dd0-b555-4413-925e-b3757d19ed84',
				},

				notLiked: {
					message: 'You have not liked that post.',
					code: 'NOT_LIKED',
					id: 'e3e8e06e-be37-41f7-a5b4-87a8250288f0',
				},
			},
		} as const,
		paramDef: galleryPostsPostIdParamDef,
	},
	'gallery/posts/update': {
		meta: {
			tags: ['gallery'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:gallery',

			limit: {
				duration: HOUR,
				max: 300,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'GalleryPost',
			},

			errors: {},
		} as const,
		paramDef: galleryPostsUpdateParamDef,
	},
} as const;
