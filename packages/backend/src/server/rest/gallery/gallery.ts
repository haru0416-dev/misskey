/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as galleryContracts } from '@/server/rest/contracts/gallery.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { Params } from '../validation.js';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase } from '@/core/drive/drive-file-store.js';
import {
	createGalleryLikeInDatabase,
	deleteGalleryLikeByIdFromDatabase,
	fetchGalleryLikeFromDatabase,
	galleryLikeExistsInDatabase,
	listGalleryLikesByUserIdFromDatabase,
	listLikedGalleryPostIdsByUserIdAndPostIdsFromDatabase,
} from '@/core/gallery/gallery-like-store.js';
import {
	createGalleryPostInDatabase,
	decrementGalleryPostLikedCountInDatabase,
	deleteGalleryPostByIdFromDatabase,
	fetchGalleryPostByIdFromDatabase,
	fetchGalleryPostByIdOrFailFromDatabase,
	incrementGalleryPostLikedCountInDatabase,
	listGalleryPostsByIdsFromDatabase,
	listGalleryPostsWithPaginationFromDatabase,
	listPopularGalleryPostsFromDatabase,
	updateGalleryPostByIdAndUserIdInDatabase,
} from '@/core/gallery/gallery-post-store.js';
import { logModerationEventInDatabase } from '@/core/moderation/moderation-log-logic.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';
import type { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { packDriveFileManyByIds } from '../../../core/drive/drive-file-packing.js';
import type { DriveFileDependencies } from '../../../core/drive/drive-file-packing.js';
import { ApiError } from '../error.js';
import { userIsModerator } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { packUserLite, packUserLiteMany } from '../../../core/user/user-packing.js';
import { parseApiParams } from '../validation.js';
import {
	GALLERY_POSTS_RANKING_WINDOW,
	incrementFeaturedRanking,
	readFeaturedRanking,
} from '@/core/featured/featured-ranking.js';
import { collectFilteredInOrder } from '@/misc/collect-filtered-in-order.js';

export type GalleryDependencies = DriveFileDependencies &
	RolePolicyDependencies & {
		redis: Redis.Redis;
	};

let galleryPostsRankingCache: string[] = [];
let galleryPostsRankingCacheLastFetchedAt = 0;

export const galleryFeaturedParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	untilId: misskeyId().optional(),
});

export const galleryPopularParamDef = z.object({});

export const galleryPostsParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export const galleryPostsCreateParamDef = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(32)),
	isSensitive: z.boolean().optional().default(false),
});

export const galleryPostsUpdateParamDef = z.object({
	postId: misskeyId(),
	title: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(32)).optional(),
	isSensitive: z.boolean().optional().default(false),
});

export const galleryPostsPostIdParamDef = z.object({
	postId: misskeyId(),
});

export async function packGalleryPost(
	deps: GalleryDependencies,
	src: MiGalleryPost['id'] | MiGalleryPost,
	me: { id: MiUser['id'] } | null | undefined,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		packedFiles?: Packed<'DriveFile'>[];
		isLiked?: boolean;
	},
): Promise<Packed<'GalleryPost'>> {
	const meId = me ? me.id : null;
	const post = typeof src === 'object' ? src : await fetchGalleryPostByIdOrFailFromDatabase(deps.db, src);

	const [user, files, isLiked] = await Promise.all([
		hint?.packedUser ?? packUserLite(deps, post.userId),
		hint?.packedFiles ?? packDriveFileManyByIds(deps, post.fileIds),
		hint?.isLiked ?? (meId ? galleryLikeExistsInDatabase(deps.db, meId, post.id) : Promise.resolve(undefined)),
	]);

	return {
		id: post.id,
		createdAt: parseId(post.id).date.toISOString(),
		updatedAt: post.updatedAt.toISOString(),
		userId: post.userId,
		user,
		title: post.title,
		description: post.description,
		fileIds: post.fileIds,
		files,
		tags: post.tags.length > 0 ? post.tags : undefined,
		isSensitive: post.isSensitive,
		likedCount: post.likedCount,
		isLiked,
	};
}

async function packGalleryPostsMany(
	deps: GalleryDependencies,
	posts: MiGalleryPost[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'GalleryPost'>[]> {
	if (posts.length === 0) {
		return [];
	}

	const userIds = [...new Set(posts.map((post) => post.userId))];
	const fileIds = [...new Set(posts.flatMap((post) => post.fileIds))];
	const postIds = posts.map((post) => post.id);
	const [packedUsers, packedFiles, likedPostIds] = await Promise.all([
		packUserLiteMany(deps, userIds),
		packDriveFileManyByIds(deps, fileIds),
		me ? listLikedGalleryPostIdsByUserIdAndPostIdsFromDatabase(deps.db, me.id, postIds) : Promise.resolve([]),
	]);
	const userById = new Map(packedUsers.map((user) => [user.id, user]));
	const fileById = new Map(packedFiles.map((file) => [file.id, file]));
	const likedPostIdSet = new Set(likedPostIds);

	return await Promise.all(
		posts.map((post) =>
			packGalleryPost(
				deps,
				post,
				me,
				omitUndefined({
					packedUser: userById.get(post.userId),
					packedFiles: post.fileIds
						.map((fileId) => fileById.get(fileId))
						.filter((file): file is Packed<'DriveFile'> => file != null),
					isLiked: me ? likedPostIdSet.has(post.id) : undefined,
				}),
			),
		),
	);
}

export async function handleApiGalleryFeatured(
	deps: GalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: Params<typeof galleryFeaturedParamDef>,
): Promise<Packed<'GalleryPost'>[]> {
	let postIds: string[];
	if (
		galleryPostsRankingCacheLastFetchedAt !== 0 &&
		Date.now() - galleryPostsRankingCacheLastFetchedAt < 1000 * 60 * 30
	) {
		postIds = galleryPostsRankingCache;
	} else {
		postIds = await readFeaturedRanking(deps.redis, 'featuredGalleryPostsRanking', GALLERY_POSTS_RANKING_WINDOW, 100);
		galleryPostsRankingCache = postIds;
		galleryPostsRankingCacheLastFetchedAt = Date.now();
	}

	postIds = [...postIds].sort((a, b) => (a > b ? -1 : 1));
	if (params.untilId) {
		postIds = postIds.filter((id) => id < params.untilId!);
	}

	// 削除済みの投稿の分を後ろの候補で埋め、新しい順を保つ (listGalleryPostsByIdsFromDatabase は順序を保証しない)。
	const posts = await collectFilteredInOrder(
		postIds,
		params.limit,
		async (ids) => await listGalleryPostsByIdsFromDatabase(deps.db, ids),
	);
	return await packGalleryPostsMany(deps, posts, me);
}

export async function handleApiGalleryPopular(
	deps: GalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'GalleryPost'>[]> {
	const posts = await listPopularGalleryPostsFromDatabase(deps.db);
	return await packGalleryPostsMany(deps, posts, me);
}

export async function handleApiGalleryPosts(
	deps: GalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: Params<typeof galleryPostsParamDef>,
): Promise<Packed<'GalleryPost'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsMany(deps, posts, me);
}

export async function handleApiGalleryPostsShow(
	deps: GalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: Params<typeof galleryPostsPostIdParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/show']>,
): Promise<Packed<'GalleryPost'>> {
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) {
		throw errors.noSuchPost();
	}

	return await packGalleryPost(deps, post, me);
}

export async function handleApiGalleryPostsCreate(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof galleryPostsCreateParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/create']>,
): Promise<Packed<'GalleryPost'>> {
	const files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, params.fileIds, me.id);
	if (files.length === 0) {
		throw errors.noSuchFile();
	}

	const post = await createGalleryPostInDatabase(deps.db, {
		id: genId(),
		updatedAt: new Date(),
		title: params.title,
		description: params.description,
		userId: me.id,
		isSensitive: params.isSensitive,
		fileIds: files.map((file) => file.id),
	});

	return await packGalleryPost(deps, post, me);
}

export async function handleApiGalleryPostsUpdate(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof galleryPostsUpdateParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/update']>,
): Promise<Packed<'GalleryPost'>> {
	// 更新は userId 付きの UPDATE なので、他人の投稿を指定すると 0 行のまま相手の投稿を返してしまう。先に確かめる。
	const existing = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (existing == null) {
		throw errors.noSuchPost();
	}
	if (existing.userId !== me.id) {
		throw errors.accessDenied();
	}

	let files;
	if (params.fileIds) {
		files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, params.fileIds, me.id);
		if (files.length === 0) {
			throw errors.noSuchFile();
		}
	}

	await updateGalleryPostByIdAndUserIdInDatabase(
		deps.db,
		params.postId,
		me.id,
		omitUndefined({
			updatedAt: new Date(),
			title: params.title,
			description: params.description,
			isSensitive: params.isSensitive,
			fileIds: files ? files.map((file) => file.id) : undefined,
		}),
	);

	const post = await fetchGalleryPostByIdOrFailFromDatabase(deps.db, params.postId);
	return await packGalleryPost(deps, post, me);
}

export async function handleApiGalleryPostsDelete(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof galleryPostsPostIdParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/delete']>,
): Promise<void> {
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) {
		throw errors.noSuchPost();
	}

	if (!(await userIsModerator(deps, me)) && post.userId !== me.id) {
		throw errors.accessDenied();
	}

	await deleteGalleryPostByIdFromDatabase(deps.db, post.id);

	if (post.userId !== me.id) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, post.userId);
		await logModerationEventInDatabase(deps, me, 'deleteGalleryPost', {
			postId: post.id,
			postUserId: post.userId,
			postUserUsername: user.username,
			post,
		});
	}
}

export async function handleApiGalleryPostsLike(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof galleryPostsPostIdParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/like']>,
): Promise<void> {
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) {
		throw errors.noSuchPost();
	}
	if (post.userId === me.id) {
		throw errors.yourPost();
	}

	const exist = await galleryLikeExistsInDatabase(deps.db, me.id, post.id);
	if (exist) {
		throw errors.alreadyLiked();
	}

	try {
		await createGalleryLikeInDatabase(deps.db, {
			id: genId(),
			postId: post.id,
			userId: me.id,
		});
	} catch (error) {
		if (isDuplicateKeyValueDatabaseError(error)) {
			throw errors.alreadyLiked();
		}
		throw error;
	}

	if (Date.now() - parseId(post.id).date.getTime() < GALLERY_POSTS_RANKING_WINDOW) {
		await incrementFeaturedRanking(deps.redis, 'featuredGalleryPostsRanking', GALLERY_POSTS_RANKING_WINDOW, post.id, 1);
	}

	await incrementGalleryPostLikedCountInDatabase(deps.db, post.id);
}

export async function handleApiGalleryPostsUnlike(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof galleryPostsPostIdParamDef>,
	errors: ContractErrors<(typeof galleryContracts)['gallery/posts/unlike']>,
): Promise<void> {
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) {
		throw errors.noSuchPost();
	}

	const exist = await fetchGalleryLikeFromDatabase(deps.db, me.id, post.id);
	if (exist == null) {
		throw errors.notLiked();
	}

	const deleted = await deps.db.transaction(async (transaction) => {
		const db = transaction as typeof deps.db;
		if (!(await deleteGalleryLikeByIdFromDatabase(db, exist.id))) {
			return false;
		}
		await decrementGalleryPostLikedCountInDatabase(db, post.id);
		return true;
	});
	if (!deleted) {
		throw errors.notLiked();
	}

	if (Date.now() - parseId(post.id).date.getTime() < GALLERY_POSTS_RANKING_WINDOW) {
		await incrementFeaturedRanking(
			deps.redis,
			'featuredGalleryPostsRanking',
			GALLERY_POSTS_RANKING_WINDOW,
			post.id,
			-1,
		);
	}
}

export const iGalleryPostsParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiIGalleryPosts(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof iGalleryPostsParamDef>,
): Promise<Packed<'GalleryPost'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsMany(deps, posts, me);
}

export const iGalleryLikesParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiIGalleryLikes(
	deps: GalleryDependencies,
	me: MiLocalUser,
	params: Params<typeof iGalleryLikesParamDef>,
) {
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);

	const likes = await listGalleryLikesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	if (likes.length === 0) {
		return [];
	}

	const postIds = likes.map((like) => like.postId);
	const posts = await listGalleryPostsByIdsFromDatabase(deps.db, postIds);
	const packedPosts = await packGalleryPostsMany(deps, posts, me);
	const packedPostById = new Map(packedPosts.map((post) => [post.id, post]));

	return await Promise.all(
		likes.map(async (like) => ({
			id: like.id,
			post: packedPostById.get(like.postId) ?? (await packGalleryPost(deps, like.postId, me)),
		})),
	);
}

export const usersGalleryPostsParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiUsersGalleryPosts(
	deps: GalleryDependencies,
	me: MiUser | null | undefined,
	params: Params<typeof usersGalleryPostsParamDef>,
) {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsMany(deps, posts, me);
}
