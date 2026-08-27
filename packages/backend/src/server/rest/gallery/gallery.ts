/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase } from '@/core/drive/DriveFileStore.js';
import {
	createGalleryLikeInDatabase,
	deleteGalleryLikeByIdFromDatabase,
	fetchGalleryLikeFromDatabase,
	galleryLikeExistsInDatabase,
	listGalleryLikesByUserIdFromDatabase,
	listLikedGalleryPostIdsByUserIdAndPostIdsFromDatabase,
} from '@/core/gallery/GalleryLikeStore.js';
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
	resolveGalleryPostPagination,
	updateGalleryPostByIdAndUserIdInDatabase,
} from '@/core/gallery/GalleryPostStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';
import type { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { packDriveFileManyByIdsForApi, type ApiDriveFileDependencies } from '../drive/drive-file.js';
import { ApiError } from '../error.js';
import { isApiModerator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiGalleryDependencies = ApiDriveFileDependencies &
	ApiRolePolicyDependencies & {
		redis: Redis.Redis;
	};

const GALLERY_POSTS_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3;
const featuredEpoc = new Date('2023-01-01T00:00:00Z').getTime();

function getCurrentFeaturedWindow(windowRange: number): number {
	const passed = new Date().getTime() - featuredEpoc;
	return Math.floor(passed / windowRange);
}

async function updateGalleryPostsRanking(
	deps: ApiGalleryDependencies,
	galleryPostId: string,
	score = 1,
): Promise<void> {
	const currentWindow = getCurrentFeaturedWindow(GALLERY_POSTS_RANKING_WINDOW);
	const redisTransaction = deps.redis.multi();
	redisTransaction.zincrby(`featuredGalleryPostsRanking:${currentWindow}`, score, galleryPostId);
	redisTransaction.expire(
		`featuredGalleryPostsRanking:${currentWindow}`,
		(GALLERY_POSTS_RANKING_WINDOW * 3) / 1000,
		'NX',
	);
	await redisTransaction.exec();
}

async function getGalleryPostsRanking(deps: ApiGalleryDependencies, threshold: number): Promise<string[]> {
	const currentWindow = getCurrentFeaturedWindow(GALLERY_POSTS_RANKING_WINDOW);
	const previousWindow = currentWindow - 1;

	const redisPipeline = deps.redis.pipeline();
	redisPipeline.zrange(`featuredGalleryPostsRanking:${currentWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	redisPipeline.zrange(`featuredGalleryPostsRanking:${previousWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	const [currentRankingResult = [], previousRankingResult = []] = await redisPipeline
		.exec()
		.then((result) => (result ? result.map((r) => (r[1] ?? []) as string[]) : []));

	const ranking = new Map<string, number>();
	for (let i = 0; i < currentRankingResult.length; i += 2) {
		const id = currentRankingResult[i];
		const score = currentRankingResult[i + 1];
		if (id == null || score == null) continue;
		ranking.set(id, Number.parseInt(score, 10));
	}
	for (let i = 0; i < previousRankingResult.length; i += 2) {
		const id = previousRankingResult[i];
		const scoreValue = previousRankingResult[i + 1];
		if (id == null || scoreValue == null) continue;
		const score = Number.parseInt(scoreValue, 10);
		const exist = ranking.get(id);
		ranking.set(id, exist != null ? (exist + score) / 2 : score);
	}

	return [...ranking.entries()]
		.sort((a, b) => b[1] - a[1])
		.map((x) => x[0])
		.slice(0, threshold);
}

let galleryPostsRankingCache: string[] = [];
let galleryPostsRankingCacheLastFetchedAt = 0;

export const galleryFeaturedParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	untilId: misskeyId().optional(),
});

type GalleryFeaturedParams = {
	limit: number;
	untilId?: string;
};

export const galleryPopularParamDef = z.object({});

export const galleryPostsParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
});

type GalleryPostsParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export const galleryPostsCreateParamDef = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(32)),
	isSensitive: z.boolean().optional().default(false),
});

type GalleryPostsCreateParams = {
	title: string;
	description?: string | null;
	fileIds: string[];
	isSensitive: boolean;
};

export const galleryPostsUpdateParamDef = z.object({
	postId: misskeyId(),
	title: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(32)).optional(),
	isSensitive: z.boolean().optional().default(false),
});

type GalleryPostsUpdateParams = {
	postId: string;
	title?: string;
	description?: string | null;
	fileIds?: string[];
	isSensitive: boolean;
};

export const galleryPostsPostIdParamDef = z.object({
	postId: misskeyId(),
});

type GalleryPostsPostIdParams = {
	postId: string;
};

function galleryPostsShowNoSuchPostError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such post.',
		code: 'NO_SUCH_POST',
		id: '1137bf14-c5b0-4604-85bb-5b5371b1cd45',
	});
}

function galleryPostsDeleteNoSuchPostError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such post.',
		code: 'NO_SUCH_POST',
		id: 'ae52f367-4bd7-4ecd-afc6-5672fff427f5',
	});
}

function galleryPostsDeleteAccessDeniedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: 'c86e09de-1c48-43ac-a435-1c7e42ed4496',
	});
}

function galleryPostsLikeNoSuchPostError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such post.',
		code: 'NO_SUCH_POST',
		id: '56c06af3-1287-442f-9701-c93f7c4a62ff',
	});
}

function galleryPostsLikeYourPostError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You cannot like your post.',
		code: 'YOUR_POST',
		id: 'f78f1511-5ebc-4478-a888-1198d752da68',
	});
}

function galleryPostsLikeAlreadyLikedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'The post has already been liked.',
		code: 'ALREADY_LIKED',
		id: '40e9ed56-a59c-473a-bf3f-f289c54fb5a7',
	});
}

function galleryPostsUnlikeNoSuchPostError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such post.',
		code: 'NO_SUCH_POST',
		id: 'c32e6dd0-b555-4413-925e-b3757d19ed84',
	});
}

function galleryPostsUnlikeNotLikedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You have not liked that post.',
		code: 'NOT_LIKED',
		id: 'e3e8e06e-be37-41f7-a5b4-87a8250288f0',
	});
}

export async function packGalleryPostForApi(
	deps: ApiGalleryDependencies,
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
		hint?.packedUser ?? packUserLiteForApi(deps, post.userId),
		hint?.packedFiles ?? packDriveFileManyByIdsForApi(deps, post.fileIds),
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

async function packGalleryPostsManyForApi(
	deps: ApiGalleryDependencies,
	posts: MiGalleryPost[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'GalleryPost'>[]> {
	if (posts.length === 0) return [];

	const userIds = [...new Set(posts.map((post) => post.userId))];
	const fileIds = [...new Set(posts.flatMap((post) => post.fileIds))];
	const postIds = posts.map((post) => post.id);
	const [packedUsers, packedFiles, likedPostIds] = await Promise.all([
		packUserLiteManyForApi(deps, userIds),
		packDriveFileManyByIdsForApi(deps, fileIds),
		me ? listLikedGalleryPostIdsByUserIdAndPostIdsFromDatabase(deps.db, me.id, postIds) : Promise.resolve([]),
	]);
	const userById = new Map(packedUsers.map((user) => [user.id, user]));
	const fileById = new Map(packedFiles.map((file) => [file.id, file]));
	const likedPostIdSet = new Set(likedPostIds);

	return await Promise.all(
		posts.map((post) =>
			packGalleryPostForApi(
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
	deps: ApiGalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>[]> {
	const params = parseApiParams(galleryFeaturedParamDef, body);

	let postIds: string[];
	if (
		galleryPostsRankingCacheLastFetchedAt !== 0 &&
		Date.now() - galleryPostsRankingCacheLastFetchedAt < 1000 * 60 * 30
	) {
		postIds = galleryPostsRankingCache;
	} else {
		postIds = await getGalleryPostsRanking(deps, 100);
		galleryPostsRankingCache = postIds;
		galleryPostsRankingCacheLastFetchedAt = Date.now();
	}

	postIds = [...postIds].sort((a, b) => (a > b ? -1 : 1));
	if (params.untilId) {
		postIds = postIds.filter((id) => id < params.untilId!);
	}
	postIds = postIds.slice(0, params.limit);

	if (postIds.length === 0) return [];

	const posts = await listGalleryPostsByIdsFromDatabase(deps.db, postIds);
	return await packGalleryPostsManyForApi(deps, posts, me);
}

export async function handleApiGalleryPopular(
	deps: ApiGalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>[]> {
	parseApiParams(galleryPopularParamDef, body);
	const posts = await listPopularGalleryPostsFromDatabase(deps.db);
	return await packGalleryPostsManyForApi(deps, posts, me);
}

export async function handleApiGalleryPosts(
	deps: ApiGalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>[]> {
	const params = parseApiParams(galleryPostsParamDef, body);
	const pagination = resolveGalleryPostPagination({ gen: (time) => genId(time) }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsManyForApi(deps, posts, me);
}

export async function handleApiGalleryPostsShow(
	deps: ApiGalleryDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>> {
	const params = parseApiParams(galleryPostsPostIdParamDef, body);
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) throw galleryPostsShowNoSuchPostError();

	return await packGalleryPostForApi(deps, post, me);
}

export async function handleApiGalleryPostsCreate(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>> {
	const params = parseApiParams(galleryPostsCreateParamDef, body);
	const files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, params.fileIds, me.id);
	if (files.length === 0) throw new Error();

	const post = await createGalleryPostInDatabase(deps.db, {
		id: genId(),
		updatedAt: new Date(),
		title: params.title,
		description: params.description,
		userId: me.id,
		isSensitive: params.isSensitive,
		fileIds: files.map((file) => file.id),
	});

	return await packGalleryPostForApi(deps, post, me);
}

export async function handleApiGalleryPostsUpdate(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>> {
	const params = parseApiParams(galleryPostsUpdateParamDef, body);

	let files;
	if (params.fileIds) {
		files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, params.fileIds, me.id);
		if (files.length === 0) throw new Error();
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
	return await packGalleryPostForApi(deps, post, me);
}

export async function handleApiGalleryPostsDelete(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(galleryPostsPostIdParamDef, body);
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) throw galleryPostsDeleteNoSuchPostError();

	if (!(await isApiModerator(deps, me)) && post.userId !== me.id) {
		throw galleryPostsDeleteAccessDeniedError();
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
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(galleryPostsPostIdParamDef, body);
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) throw galleryPostsLikeNoSuchPostError();
	if (post.userId === me.id) throw galleryPostsLikeYourPostError();

	const exist = await galleryLikeExistsInDatabase(deps.db, me.id, post.id);
	if (exist) throw galleryPostsLikeAlreadyLikedError();

	try {
		await createGalleryLikeInDatabase(deps.db, {
			id: genId(),
			postId: post.id,
			userId: me.id,
		});
	} catch (error) {
		if (isDuplicateKeyValueDatabaseError(error)) {
			throw galleryPostsLikeAlreadyLikedError();
		}
		throw error;
	}

	if (Date.now() - parseId(post.id).date.getTime() < GALLERY_POSTS_RANKING_WINDOW) {
		await updateGalleryPostsRanking(deps, post.id, 1);
	}

	await incrementGalleryPostLikedCountInDatabase(deps.db, post.id);
}

export async function handleApiGalleryPostsUnlike(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(galleryPostsPostIdParamDef, body);
	const post = await fetchGalleryPostByIdFromDatabase(deps.db, params.postId);
	if (post == null) throw galleryPostsUnlikeNoSuchPostError();

	const exist = await fetchGalleryLikeFromDatabase(deps.db, me.id, post.id);
	if (exist == null) throw galleryPostsUnlikeNotLikedError();

	await deleteGalleryLikeByIdFromDatabase(deps.db, exist.id);

	if (Date.now() - parseId(post.id).date.getTime() < GALLERY_POSTS_RANKING_WINDOW) {
		await updateGalleryPostsRanking(deps, post.id, -1);
	}

	await decrementGalleryPostLikedCountInDatabase(deps.db, post.id);
}

export const iGalleryPostsParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
});

type IGalleryPostsParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiIGalleryPosts(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'GalleryPost'>[]> {
	const params = parseApiParams(iGalleryPostsParamDef, body);
	const pagination = resolveGalleryPostPagination({ gen: (time) => genId(time) }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsManyForApi(deps, posts, me);
}

export const iGalleryLikesParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
});

type IGalleryLikesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiIGalleryLikes(
	deps: ApiGalleryDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseApiParams(iGalleryLikesParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);

	const likes = await listGalleryLikesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	if (likes.length === 0) return [];

	const postIds = likes.map((like) => like.postId);
	const posts = await listGalleryPostsByIdsFromDatabase(deps.db, postIds);
	const packedPosts = await packGalleryPostsManyForApi(deps, posts, me);
	const packedPostById = new Map(packedPosts.map((post) => [post.id, post]));

	return await Promise.all(
		likes.map(async (like) => ({
			id: like.id,
			post: packedPostById.get(like.postId) ?? (await packGalleryPostForApi(deps, like.postId, me)),
		})),
	);
}

export const usersGalleryPostsParamDef = z.object({
	userId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
});

type UsersGalleryPostsParams = {
	userId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiUsersGalleryPosts(
	deps: ApiGalleryDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseApiParams(usersGalleryPostsParamDef, body);
	const pagination = resolveGalleryPostPagination({ gen: (time) => genId(time) }, params);
	const posts = await listGalleryPostsWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packGalleryPostsManyForApi(deps, posts, me);
}
