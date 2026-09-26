/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as galleryContracts } from '@/server/api/metas/gallery.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiGalleryFeatured,
	handleApiGalleryPopular,
	handleApiGalleryPosts,
	handleApiGalleryPostsCreate,
	handleApiGalleryPostsDelete,
	handleApiGalleryPostsLike,
	handleApiGalleryPostsShow,
	handleApiGalleryPostsUnlike,
	handleApiGalleryPostsUpdate,
} from '../gallery/gallery.js';

export const galleryEndpoints = implementEndpoints<ApiShellDependencies>()(galleryContracts, {
	'gallery/featured': async ({ deps, input, me }) => await handleApiGalleryFeatured(deps, me, input),
	'gallery/popular': async ({ deps, me }) => await handleApiGalleryPopular(deps, me),
	'gallery/posts': async ({ deps, input, me }) => await handleApiGalleryPosts(deps, me, input),
	'gallery/posts/create': async ({ deps, input, me }) => await handleApiGalleryPostsCreate(deps, me, input),
	'gallery/posts/delete': async ({ deps, errors, input, me }) => {
		await handleApiGalleryPostsDelete(deps, me, input, errors);
	},
	'gallery/posts/like': async ({ deps, errors, input, me }) => {
		await handleApiGalleryPostsLike(deps, me, input, errors);
	},
	'gallery/posts/show': async ({ deps, errors, input, me }) => await handleApiGalleryPostsShow(deps, me, input, errors),
	'gallery/posts/unlike': async ({ deps, errors, input, me }) => {
		await handleApiGalleryPostsUnlike(deps, me, input, errors);
	},
	'gallery/posts/update': async ({ deps, input, me }) => await handleApiGalleryPostsUpdate(deps, me, input),
});
