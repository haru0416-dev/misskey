/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	fetchDriveFileByIdAndUserIdFromDatabase,
	listDriveFilesByIdsFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { adjustNotesPageCountInDatabase } from '@/core/note/NoteStore.js';
import {
	fetchPageLikeByIdOrFailFromDatabase,
	listLikedPageIdsByUserIdAndPageIdsFromDatabase,
	listPageLikesByUserIdFromDatabase,
	pageLikeExistsInDatabase,
} from '@/core/page/PageLikeStore.js';
import {
	createPageInDatabase,
	deletePageInDatabase,
	fetchPageByIdFromDatabase,
	fetchPageByIdOrFailFromDatabase,
	fetchPageByNameAndUserIdFromDatabase,
	listFeaturedPagesFromDatabase,
	listPagesByIdsFromDatabase,
	listPagesByUserIdWithPaginationFromDatabase,
	pageNameExistsForUserInDatabase,
	resolvePagePagination,
	updatePageContentInDatabase,
	updatePageInDatabase,
} from '@/core/page/PageStore.js';
import { fetchLocalUserByUsernameFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import { MiPage, pageNameSchema, type MiPageContentBlock } from '@/models/Page.js';
import type { PageLikeRow } from '@/db/schema/page-like.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { packDriveFileForApi, packDriveFileManyForApi, type ApiDriveFileDependencies } from '../drive/drive-file.js';
import { isApiModerator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

/** `pageNameSchema` の pattern を Zod 用に再利用する。 */
const pageNamePattern = new RegExp(pageNameSchema.pattern);

export type ApiPageDependencies = ApiDriveFileDependencies & ApiRolePolicyDependencies;

function collectReferencedNotesForApi(content: MiPage['content']): string[] {
	const referencingNotes = new Set<string>();
	const recursiveCollect = (items: unknown[]): void => {
		for (const item of items) {
			if (typeof item === 'object' && item !== null && 'type' in item) {
				if (item.type === 'note' && 'note' in item && typeof item.note === 'string') {
					referencingNotes.add(item.note);
				}
				if (item.type === 'section' && 'children' in item && Array.isArray(item.children)) {
					recursiveCollect(item.children);
				}
			}
		}
	};
	recursiveCollect(content);
	return [...referencingNotes];
}

function collectAttachedFileIdsForApi(content: MiPage['content']): string[] {
	const attachedFiles: string[] = [];
	const collectFiles = (items: MiPageContentBlock[]): void => {
		for (const item of items) {
			if (item.type === 'image' && item.fileId) {
				attachedFiles.push(item.fileId);
			}
			if (item.children) {
				collectFiles(item.children);
			}
		}
	};
	collectFiles(content);
	return attachedFiles;
}

export async function packPageForApi(
	deps: ApiPageDependencies,
	src: MiPage['id'] | MiPage,
	me?: { id: MiUser['id'] } | null | undefined,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		packedEyeCatchingImage?: Packed<'DriveFile'> | null;
		packedAttachedFiles?: Packed<'DriveFile'>[];
		isLiked?: boolean;
	},
): Promise<Packed<'Page'>> {
	const meId = me ? me.id : null;
	const pageEntity = typeof src === 'object' ? src : await fetchPageByIdOrFailFromDatabase(deps.db, src);

	const attachedFiles = collectAttachedFileIdsForApi(pageEntity.content);

	let migrated = false;
	const migrate = (items: MiPageContentBlock[]): void => {
		for (const item of items) {
			if (item.type === 'input') {
				if (item.inputType === 'text') {
					item.type = 'textInput';
				}
				if (item.inputType === 'number') {
					item.type = 'numberInput';
					if (item.default) item.default = Number.parseInt(String(item.default), 10);
				}
				migrated = true;
			}
			if (item.children) {
				migrate(item.children);
			}
		}
	};
	migrate(pageEntity.content);
	if (migrated) {
		void updatePageContentInDatabase(deps.db, pageEntity.id, pageEntity.content);
	}

	const [user, eyeCatchingImage, attachedFilesPacked, pageLikeExists] = await Promise.all([
		hint?.packedUser ?? packUserLiteForApi(deps, pageEntity.user ?? pageEntity.userId),
		hint?.packedEyeCatchingImage !== undefined
			? hint.packedEyeCatchingImage
			: pageEntity.eyeCatchingImageId
				? packDriveFileForApi(deps, pageEntity.eyeCatchingImageId)
				: Promise.resolve(null),
		hint?.packedAttachedFiles ??
			(async () => {
				const files = attachedFiles.length > 0 ? await listDriveFilesByIdsFromDatabase(deps.db, attachedFiles) : [];
				const fileById = new Map(files.map((file) => [file.id, file]));
				const orderedFiles = attachedFiles
					.map((fileId) => fileById.get(fileId))
					.filter((file): file is NonNullable<typeof file> => file != null && file.userId === pageEntity.userId);
				return await packDriveFileManyForApi(deps, orderedFiles);
			})(),
		hint?.isLiked ?? (meId ? pageLikeExistsInDatabase(deps.db, meId, pageEntity.id) : Promise.resolve(undefined)),
	]);

	return {
		id: pageEntity.id,
		createdAt: parseId(pageEntity.id).date.toISOString(),
		updatedAt: pageEntity.updatedAt.toISOString(),
		userId: pageEntity.userId,
		user,
		content: pageEntity.content,
		variables: pageEntity.variables,
		title: pageEntity.title,
		name: pageEntity.name,
		summary: pageEntity.summary,
		hideTitleWhenPinned: pageEntity.hideTitleWhenPinned,
		alignCenter: pageEntity.alignCenter,
		font: pageEntity.font,
		script: pageEntity.script,
		eyeCatchingImageId: pageEntity.eyeCatchingImageId,
		eyeCatchingImage,
		attachedFiles: attachedFilesPacked,
		likedCount: pageEntity.likedCount,
		isLiked: pageLikeExists,
	};
}

async function packPageManyForApi(
	deps: ApiPageDependencies,
	pages: MiPage[],
	me?: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'Page'>[]> {
	if (pages.length === 0) return [];

	const users = pages.map(({ user, userId }) => user ?? userId);
	const pageIds = pages.map((pageEntity) => pageEntity.id);
	const fileIds = [
		...new Set(
			pages.flatMap((pageEntity) => [
				...(pageEntity.eyeCatchingImageId ? [pageEntity.eyeCatchingImageId] : []),
				...collectAttachedFileIdsForApi(pageEntity.content),
			]),
		),
	];
	const [packedUsers, files, likedPageIds] = await Promise.all([
		packUserLiteManyForApi(deps, users),
		fileIds.length > 0 ? listDriveFilesByIdsFromDatabase(deps.db, fileIds) : Promise.resolve([]),
		me ? listLikedPageIdsByUserIdAndPageIdsFromDatabase(deps.db, me.id, pageIds) : Promise.resolve([]),
	]);
	const packedUserById = new Map(packedUsers.map((u) => [u.id, u]));
	const packedFiles = await packDriveFileManyForApi(deps, files);
	const packedFileById = new Map(packedFiles.map((file) => [file.id, file]));
	const fileById = new Map(files.map((file) => [file.id, file]));
	const likedPageIdSet = new Set(likedPageIds);

	return await Promise.all(
		pages.map((pageEntity) => {
			const attachedFileIds = collectAttachedFileIdsForApi(pageEntity.content);
			return packPageForApi(
				deps,
				pageEntity,
				me,
				omitUndefined({
					packedUser: packedUserById.get(pageEntity.userId),
					packedEyeCatchingImage: pageEntity.eyeCatchingImageId
						? (packedFileById.get(pageEntity.eyeCatchingImageId) ?? null)
						: null,
					packedAttachedFiles: attachedFileIds
						.map((fileId) => {
							const file = fileById.get(fileId);
							return file?.userId === pageEntity.userId ? packedFileById.get(fileId) : undefined;
						})
						.filter((file): file is Packed<'DriveFile'> => file != null),
					isLiked: me ? likedPageIdSet.has(pageEntity.id) : undefined,
				}),
			);
		}),
	);
}

async function packPageLikeForApi(
	deps: ApiPageDependencies,
	src: PageLikeRow['id'] | (PageLikeRow & { page?: MiPage | null }),
	me?: { id: MiUser['id'] } | null | undefined,
): Promise<{ id: string; page: Packed<'Page'> }> {
	const like = typeof src === 'object' ? src : await fetchPageLikeByIdOrFailFromDatabase(deps.db, src);
	const pageSrc = typeof src === 'object' ? (src.page ?? src.pageId) : like.pageId;

	return {
		id: like.id,
		page: await packPageForApi(deps, pageSrc, me),
	};
}

export const pagesCreateParamDef = z.object({
	title: z.string(),
	name: z.string().min(1).regex(pageNamePattern),
	summary: z.string().nullable().optional(),
	content: z.array(z.record(z.string(), z.unknown())),
	variables: z.array(z.record(z.string(), z.unknown())),
	script: z.string(),
	eyeCatchingImageId: misskeyId().nullable().optional(),
	font: z.enum(['serif', 'sans-serif']).optional().default('sans-serif'),
	alignCenter: z.boolean().optional().default(false),
	hideTitleWhenPinned: z.boolean().optional().default(false),
});

export async function handleApiPagesCreate(
	deps: ApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>> {
	const params = parseApiParams(pagesCreateParamDef, body);

	let eyeCatchingImage = null;
	if (params.eyeCatchingImageId != null) {
		eyeCatchingImage = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.eyeCatchingImageId, me.id);
		if (eyeCatchingImage == null) {
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: 'b7b97489-0f66-4b12-a5ff-b21bd63f6e1c',
			});
		}
	}

	if (await pageNameExistsForUserInDatabase(deps.db, me.id, params.name)) {
		throw new ApiError({
			status: 400,
			message: 'Specified name already exists.',
			code: 'NAME_ALREADY_EXISTS',
			id: '4650348e-301c-499a-83c9-6aa988c66bc1',
		});
	}

	const pageEntity = await createPageInDatabase(deps.db, {
		id: genId(),
		updatedAt: new Date(),
		title: params.title,
		name: params.name,
		summary: params.summary ?? null,
		content: params.content,
		variables: params.variables,
		script: params.script,
		eyeCatchingImageId: eyeCatchingImage ? eyeCatchingImage.id : null,
		userId: me.id,
		visibility: 'public',
		alignCenter: params.alignCenter,
		hideTitleWhenPinned: params.hideTitleWhenPinned,
		font: params.font,
	});

	const referencedNotes = collectReferencedNotesForApi(pageEntity.content);
	if (referencedNotes.length > 0) {
		await adjustNotesPageCountInDatabase(deps.db, referencedNotes, 1);
	}

	return await packPageForApi(deps, pageEntity);
}

export const pagesUpdateParamDef = z.object({
	pageId: misskeyId(),
	title: z.string().optional(),
	name: z.string().min(1).regex(pageNamePattern).optional(),
	summary: z.string().nullable().optional(),
	content: z.array(z.record(z.string(), z.unknown())).optional(),
	variables: z.array(z.record(z.string(), z.unknown())).optional(),
	script: z.string().optional(),
	eyeCatchingImageId: misskeyId().nullable().optional(),
	font: z.enum(['serif', 'sans-serif']).optional(),
	alignCenter: z.boolean().optional(),
	hideTitleWhenPinned: z.boolean().optional(),
});

export async function handleApiPagesUpdate(
	deps: ApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(pagesUpdateParamDef, body);

	let eyeCatchingImageId = params.eyeCatchingImageId;
	if (params.eyeCatchingImageId !== undefined && params.eyeCatchingImageId != null) {
		const eyeCatchingImage = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.eyeCatchingImageId, me.id);
		if (eyeCatchingImage == null) {
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: 'cfc23c7c-3887-490e-af30-0ed576703c82',
			});
		}
		eyeCatchingImageId = eyeCatchingImage.id;
	}

	const result = await updatePageInDatabase(
		deps.db,
		params.pageId,
		me.id,
		omitUndefined({
			title: params.title,
			name: params.name,
			summary: params.summary,
			content: params.content,
			variables: params.variables,
			script: params.script,
			alignCenter: params.alignCenter,
			hideTitleWhenPinned: params.hideTitleWhenPinned,
			font: params.font,
			eyeCatchingImageId: params.eyeCatchingImageId === undefined ? undefined : eyeCatchingImageId,
		}),
	);

	if (result.status === 'not-found') {
		throw new ApiError({
			status: 400,
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: '21149b9e-3616-4778-9592-c4ce89f5a864',
		});
	}
	if (result.status === 'forbidden') {
		throw new ApiError({
			status: 400,
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '3c15cd52-3b4b-4274-967d-6456fc4f792b',
		});
	}
	if (result.status === 'name-conflict') {
		throw new ApiError({
			status: 400,
			message: 'Specified name already exists.',
			code: 'NAME_ALREADY_EXISTS',
			id: '2298a392-d4a1-44c5-9ebb-ac1aeaa5a9ab',
		});
	}

	const { before } = result;

	if (params.content != null) {
		const beforeReferencedNotes = collectReferencedNotesForApi(before.content);
		const afterReferencedNotes = collectReferencedNotesForApi(params.content);
		const beforeReferencedNoteSet = new Set(beforeReferencedNotes);
		const afterReferencedNoteSet = new Set(afterReferencedNotes);

		const removedNotes = beforeReferencedNotes.filter((noteId) => !afterReferencedNoteSet.has(noteId));
		const addedNotes = afterReferencedNotes.filter((noteId) => !beforeReferencedNoteSet.has(noteId));

		if (removedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(deps.db, removedNotes, -1);
		}
		if (addedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(deps.db, addedNotes, 1);
		}
	}
}

export const pagesDeleteParamDef = z.object({
	pageId: misskeyId(),
});

/** not-found/forbiddenはHTTPエラーに変換せず、そのままステータスとして返す。 */
export async function deletePageForApi(
	deps: ApiPageDependencies,
	me: MiUser,
	pageId: MiPage['id'],
): Promise<{ status: 'not-found' | 'forbidden' } | { status: 'ok'; page: MiPage }> {
	const isModerator = await isApiModerator(deps, me);

	const result = await deletePageInDatabase(deps.db, pageId, { userId: me.id, isModerator });

	if (result.status !== 'ok') {
		return result;
	}

	const { page: deletedPage } = result;

	if (deletedPage.userId !== me.id) {
		const pageOwner = await fetchUserByIdOrFailFromDatabase(deps.db, deletedPage.userId);
		await logModerationEventInDatabase(deps, me, 'deletePage', {
			pageId: deletedPage.id,
			pageUserId: deletedPage.userId,
			pageUserUsername: pageOwner.username,
			page: deletedPage,
		});
	}

	const referencedNotes = collectReferencedNotesForApi(deletedPage.content);
	if (referencedNotes.length > 0) {
		await adjustNotesPageCountInDatabase(deps.db, referencedNotes, -1);
	}

	return { status: 'ok', page: deletedPage };
}

export async function handleApiPagesDelete(
	deps: ApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(pagesDeleteParamDef, body);

	const result = await deletePageForApi(deps, me, params.pageId);

	if (result.status === 'not-found') {
		throw new ApiError({
			status: 400,
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: 'eb0c6e1d-d519-4764-9486-52a7e1c6392a',
		});
	}
	if (result.status === 'forbidden') {
		throw new ApiError({
			status: 400,
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '8b741b3e-2c22-44b3-a15f-29949aa1601e',
		});
	}
}

/**
 * pageId、または name と username の組のいずれかが妥当なら受理する。
 * 一方の分岐に含まれないプロパティは判定に影響しない。
 */
export const pagesShowParamDef = z.union([
	z.object({ pageId: misskeyId() }),
	z.object({ name: z.string(), username: z.string() }),
]);

export async function handleApiPagesShow(
	deps: ApiPageDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>> {
	const params = parseApiParams(pagesShowParamDef, body);

	let pageEntity: MiPage | null = null;
	if ('pageId' in params) {
		pageEntity = await fetchPageByIdFromDatabase(deps.db, params.pageId);
	} else {
		const author = await fetchLocalUserByUsernameFromDatabase(deps.db, params.username);
		if (author) {
			pageEntity = await fetchPageByNameAndUserIdFromDatabase(deps.db, params.name, author.id);
		}
	}

	if (pageEntity == null) {
		throw new ApiError({
			status: 400,
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: '222120c0-3ead-4528-811b-b96f233388d7',
		});
	}

	return await packPageForApi(deps, pageEntity, me);
}

export const pagesFeaturedParamDef = z.object({});

export async function handleApiPagesFeatured(
	deps: ApiPageDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	parseApiParams(pagesFeaturedParamDef, body);

	const pages = await listFeaturedPagesFromDatabase(deps.db);

	return await packPageManyForApi(deps, pages, me);
}

export const iPagesParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiIPages(
	deps: ApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	const params = parseApiParams(iPagesParamDef, body);
	const { sinceId, untilId, order } = resolvePagePagination({ gen: (time) => genId(time) }, params);

	const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return await packPageManyForApi(deps, pages);
}

export const iPageLikesParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiIPageLikes(
	deps: ApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; page: Packed<'Page'> }[]> {
	const params = parseApiParams(iPageLikesParamDef, body);

	let sinceId: string | null = null;
	let untilId: string | null = null;
	let order: 'asc' | 'desc' = 'desc';

	if (params.sinceId && params.untilId) {
		sinceId = params.sinceId;
		untilId = params.untilId;
	} else if (params.sinceId) {
		sinceId = params.sinceId;
		order = 'asc';
	} else if (params.untilId) {
		untilId = params.untilId;
	} else if (params.sinceDate && params.untilDate) {
		sinceId = genId(params.sinceDate);
		untilId = genId(params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(params.untilDate);
	}

	const likes = await listPageLikesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	if (likes.length === 0) return [];

	const pageIds = likes.map((like) => like.pageId);
	const pageById = await listPagesByIdsFromDatabase(deps.db, pageIds).then(
		(pages) => new Map(pages.map((pageEntity) => [pageEntity.id, pageEntity])),
	);
	const packedPages = await packPageManyForApi(
		deps,
		likes.map((like) => pageById.get(like.pageId)).filter((page) => page != null),
		me,
	);
	const packedPageById = new Map(packedPages.map((page) => [page.id, page]));

	return await Promise.all(
		likes.map(async (like) => ({
			id: like.id,
			page: packedPageById.get(like.pageId) ?? (await packPageLikeForApi(deps, like, me)).page,
		})),
	);
}

export const usersPagesParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiUsersPages(
	deps: ApiPageDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	const params = parseApiParams(usersPagesParamDef, body);
	const { sinceId, untilId, order } = resolvePagePagination({ gen: (time) => genId(time) }, params);

	const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, params.userId, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
		publicOnly: true,
	});

	return await packPageManyForApi(deps, pages);
}
