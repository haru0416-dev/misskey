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
} from '@/server/rest/gallery/gallery.js';
import { HOUR } from '@/const.js';
import { defineContract } from '@/server/rest/endpoint-contract.js';

export const endpointMetas = {
	'gallery/featured': defineContract({
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
		},
		paramDef: galleryFeaturedParamDef,
	}),
	'gallery/popular': defineContract({
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
		},
		paramDef: galleryPopularParamDef,
	}),
	'gallery/posts': defineContract({
		meta: {
			allowQuery: true,
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
		},
		paramDef: galleryPostsParamDef,
	}),
	'gallery/posts/create': defineContract({
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

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '47374ca6-f90e-4f3a-9e44-274929d51249',
				},
			},
		},
		paramDef: galleryPostsCreateParamDef,
	}),
	'gallery/posts/delete': defineContract({
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
		},
		paramDef: galleryPostsPostIdParamDef,
	}),
	'gallery/posts/like': defineContract({
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
		},
		paramDef: galleryPostsPostIdParamDef,
	}),
	'gallery/posts/show': defineContract({
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
		},
		paramDef: galleryPostsPostIdParamDef,
	}),
	'gallery/posts/unlike': defineContract({
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
		},
		paramDef: galleryPostsPostIdParamDef,
	}),
	'gallery/posts/update': defineContract({
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

			errors: {
				noSuchPost: {
					message: 'No such post.',
					code: 'NO_SUCH_POST',
					id: 'd2cf7ac2-31d3-4498-8504-e8bd05923719',
				},
				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '6fa79fc9-dd78-45fd-963f-67dcab8c68de',
				},
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '1dbf43b4-5b79-49e2-a789-59869995b140',
				},
			},
		},
		paramDef: galleryPostsUpdateParamDef,
	}),
};
