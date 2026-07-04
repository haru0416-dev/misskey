/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { adjustNotesPageCountInDatabase } from '@/core/NoteStore.js';
import {
	fetchPageLikeByIdOrFailFromDatabase,
	listPageLikesByUserIdFromDatabase,
	pageLikeExistsInDatabase,
} from '@/core/PageLikeStore.js';
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
} from '@/core/PageStore.js';
import { fetchLocalUserByUsernameFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { MiPage, pageNameSchema } from '@/models/Page.js';
import type { PageLikeRow } from '@/db/schema/page-like.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packDriveFileForHonoApi, packDriveFileManyForHonoApi, type HonoApiDriveFileDependencies } from './hono-api-drive-file.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { packUserLiteForHonoApi } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiPageDependencies = HonoApiDriveFileDependencies & HonoApiRolePolicyDependencies;

export function collectReferencedNotesForHonoApi(content: MiPage['content']): string[] {
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

export async function packPageForHonoApi(
	deps: HonoApiPageDependencies,
	src: MiPage['id'] | MiPage,
	me?: { id: MiUser['id'] } | null | undefined,
	hint?: { packedUser?: Packed<'UserLite'> },
): Promise<Packed<'Page'>> {
	const meId = me ? me.id : null;
	const pageEntity = typeof src === 'object' ? src : await fetchPageByIdOrFailFromDatabase(deps.db, src);

	const attachedFiles: string[] = [];
	const collectFiles = (items: any[]): void => {
		for (const item of items) {
			if (item.type === 'image') {
				attachedFiles.push(item.fileId);
			}
			if (item.children) {
				collectFiles(item.children);
			}
		}
	};
	collectFiles(pageEntity.content);

	let migrated = false;
	const migrate = (items: any[]): void => {
		for (const item of items) {
			if (item.type === 'input') {
				if (item.inputType === 'text') {
					item.type = 'textInput';
				}
				if (item.inputType === 'number') {
					item.type = 'numberInput';
					if (item.default) item.default = parseInt(item.default, 10);
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
		hint?.packedUser ?? packUserLiteForHonoApi(deps, pageEntity.user ?? pageEntity.userId),
		pageEntity.eyeCatchingImageId ? packDriveFileForHonoApi(deps, pageEntity.eyeCatchingImageId) : Promise.resolve(null),
		(async () => {
			const files = attachedFiles.length > 0
				? (await Promise.all(attachedFiles.map(fileId => fetchDriveFileByIdAndUserIdFromDatabase(deps.db, fileId, pageEntity.userId))))
					.filter((file): file is NonNullable<typeof file> => file != null)
				: [];
			return await packDriveFileManyForHonoApi(deps, files);
		})(),
		meId ? pageLikeExistsInDatabase(deps.db, meId, pageEntity.id) : Promise.resolve(undefined),
	]);

	return {
		id: pageEntity.id,
		createdAt: parseId(deps.config, pageEntity.id).date.toISOString(),
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

export async function packPageManyForHonoApi(
	deps: HonoApiPageDependencies,
	pages: MiPage[],
	me?: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'Page'>[]> {
	if (pages.length === 0) return [];

	const users = pages.map(({ user, userId }) => user ?? userId);
	const packedUsers = await Promise.all(users.map(u => packUserLiteForHonoApi(deps, u)));
	const packedUserById = new Map(packedUsers.map(u => [u.id, u]));

	return await Promise.all(pages.map(pageEntity => packPageForHonoApi(deps, pageEntity, me, { packedUser: packedUserById.get(pageEntity.userId) })));
}

export async function packPageLikeForHonoApi(
	deps: HonoApiPageDependencies,
	src: PageLikeRow['id'] | (PageLikeRow & { page?: MiPage | null }),
	me?: { id: MiUser['id'] } | null | undefined,
): Promise<{ id: string; page: Packed<'Page'> }> {
	const like = typeof src === 'object' ? src : await fetchPageLikeByIdOrFailFromDatabase(deps.db, src);
	const pageSrc = typeof src === 'object' ? (src.page ?? src.pageId) : like.pageId;

	return {
		id: like.id,
		page: await packPageForHonoApi(deps, pageSrc, me),
	};
}

const pagesCreateParamDef = {
	type: 'object',
	properties: {
		title: { type: 'string' },
		name: { ...pageNameSchema, minLength: 1 },
		summary: { type: 'string', nullable: true },
		content: { type: 'array', items: { type: 'object', additionalProperties: true } },
		variables: { type: 'array', items: { type: 'object', additionalProperties: true } },
		script: { type: 'string' },
		eyeCatchingImageId: { type: 'string', format: 'misskey:id', nullable: true },
		font: { type: 'string', enum: ['serif', 'sans-serif'], default: 'sans-serif' },
		alignCenter: { type: 'boolean', default: false },
		hideTitleWhenPinned: { type: 'boolean', default: false },
	},
	required: ['title', 'name', 'content', 'variables', 'script'],
} as const;

type PagesCreateParams = {
	title: string;
	name: string;
	summary?: string | null;
	content: Record<string, any>[];
	variables: Record<string, any>[];
	script: string;
	eyeCatchingImageId?: string | null;
	font: 'serif' | 'sans-serif';
	alignCenter: boolean;
	hideTitleWhenPinned: boolean;
};

export async function handleHonoApiPagesCreate(
	deps: HonoApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>> {
	const params = parseHonoApiParams(pagesCreateParamDef, body) as PagesCreateParams;

	let eyeCatchingImage = null;
	if (params.eyeCatchingImageId != null) {
		eyeCatchingImage = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.eyeCatchingImageId, me.id);
		if (eyeCatchingImage == null) {
			throw new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id: 'b7b97489-0f66-4b12-a5ff-b21bd63f6e1c' });
		}
	}

	if (await pageNameExistsForUserInDatabase(deps.db, me.id, params.name)) {
		throw new HonoApiError({ status: 400, message: 'Specified name already exists.', code: 'NAME_ALREADY_EXISTS', id: '4650348e-301c-499a-83c9-6aa988c66bc1' });
	}

	const pageEntity = await createPageInDatabase(deps.db, {
		id: genId(deps.config),
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

	const referencedNotes = collectReferencedNotesForHonoApi(pageEntity.content);
	if (referencedNotes.length > 0) {
		await adjustNotesPageCountInDatabase(deps.db, referencedNotes, 1);
	}

	return await packPageForHonoApi(deps, pageEntity);
}

const pagesUpdateParamDef = {
	type: 'object',
	properties: {
		pageId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string' },
		name: { ...pageNameSchema, minLength: 1 },
		summary: { type: 'string', nullable: true },
		content: { type: 'array', items: { type: 'object', additionalProperties: true } },
		variables: { type: 'array', items: { type: 'object', additionalProperties: true } },
		script: { type: 'string' },
		eyeCatchingImageId: { type: 'string', format: 'misskey:id', nullable: true },
		font: { type: 'string', enum: ['serif', 'sans-serif'] },
		alignCenter: { type: 'boolean' },
		hideTitleWhenPinned: { type: 'boolean' },
	},
	required: ['pageId'],
} as const;

type PagesUpdateParams = {
	pageId: string;
	title?: string;
	name?: string;
	summary?: string | null;
	content?: Record<string, any>[];
	variables?: Record<string, any>[];
	script?: string;
	eyeCatchingImageId?: string | null;
	font?: 'serif' | 'sans-serif';
	alignCenter?: boolean;
	hideTitleWhenPinned?: boolean;
};

export async function handleHonoApiPagesUpdate(
	deps: HonoApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pagesUpdateParamDef, body) as PagesUpdateParams;

	let eyeCatchingImageId = params.eyeCatchingImageId;
	if (params.eyeCatchingImageId !== undefined && params.eyeCatchingImageId != null) {
		const eyeCatchingImage = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.eyeCatchingImageId, me.id);
		if (eyeCatchingImage == null) {
			throw new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id: 'cfc23c7c-3887-490e-af30-0ed576703c82' });
		}
		eyeCatchingImageId = eyeCatchingImage.id;
	}

	const result = await updatePageInDatabase(deps.db, params.pageId, me.id, {
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
	});

	if (result.status === 'not-found') {
		throw new HonoApiError({ status: 400, message: 'No such page.', code: 'NO_SUCH_PAGE', id: '21149b9e-3616-4778-9592-c4ce89f5a864' });
	}
	if (result.status === 'forbidden') {
		throw new HonoApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id: '3c15cd52-3b4b-4274-967d-6456fc4f792b' });
	}
	if (result.status === 'name-conflict') {
		throw new HonoApiError({ status: 400, message: 'Specified name already exists.', code: 'NAME_ALREADY_EXISTS', id: '2298a392-d4a1-44c5-9ebb-ac1aeaa5a9ab' });
	}

	const { before } = result;

	if (params.content != null) {
		const beforeReferencedNotes = collectReferencedNotesForHonoApi(before.content);
		const afterReferencedNotes = collectReferencedNotesForHonoApi(params.content);

		const removedNotes = beforeReferencedNotes.filter(noteId => !afterReferencedNotes.includes(noteId));
		const addedNotes = afterReferencedNotes.filter(noteId => !beforeReferencedNotes.includes(noteId));

		if (removedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(deps.db, removedNotes, -1);
		}
		if (addedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(deps.db, addedNotes, 1);
		}
	}
}

const pagesDeleteParamDef = {
	type: 'object',
	properties: {
		pageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['pageId'],
} as const;

type PagesDeleteParams = {
	pageId: string;
};

/** PageService.delete 相当。not-found/forbiddenはHTTPエラーに変換せず、そのままステータスとして返す。 */
export async function deletePageForHonoApi(
	deps: HonoApiPageDependencies,
	me: MiUser,
	pageId: MiPage['id'],
): Promise<{ status: 'not-found' | 'forbidden' } | { status: 'ok'; page: MiPage }> {
	const isModerator = await isHonoApiModerator(deps, me);

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

	const referencedNotes = collectReferencedNotesForHonoApi(deletedPage.content);
	if (referencedNotes.length > 0) {
		await adjustNotesPageCountInDatabase(deps.db, referencedNotes, -1);
	}

	return { status: 'ok', page: deletedPage };
}

export async function handleHonoApiPagesDelete(
	deps: HonoApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pagesDeleteParamDef, body) as PagesDeleteParams;

	const result = await deletePageForHonoApi(deps, me, params.pageId);

	if (result.status === 'not-found') {
		throw new HonoApiError({ status: 400, message: 'No such page.', code: 'NO_SUCH_PAGE', id: 'eb0c6e1d-d519-4764-9486-52a7e1c6392a' });
	}
	if (result.status === 'forbidden') {
		throw new HonoApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id: '8b741b3e-2c22-44b3-a15f-29949aa1601e' });
	}
}

const pagesShowParamDef = {
	anyOf: [
		{
			type: 'object',
			properties: {
				pageId: { type: 'string', format: 'misskey:id' },
			},
			required: ['pageId'],
		},
		{
			type: 'object',
			properties: {
				name: { type: 'string' },
				username: { type: 'string' },
			},
			required: ['name', 'username'],
		},
	],
} as const;

type PagesShowParams = { pageId: string } | { name: string; username: string };

export async function handleHonoApiPagesShow(
	deps: HonoApiPageDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>> {
	const params = parseHonoApiParams(pagesShowParamDef, body) as PagesShowParams;

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
		throw new HonoApiError({ status: 400, message: 'No such page.', code: 'NO_SUCH_PAGE', id: '222120c0-3ead-4528-811b-b96f233388d7' });
	}

	return await packPageForHonoApi(deps, pageEntity, me);
}

const pagesFeaturedParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

export async function handleHonoApiPagesFeatured(
	deps: HonoApiPageDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	parseHonoApiParams(pagesFeaturedParamDef, body);

	const pages = await listFeaturedPagesFromDatabase(deps.db);

	return await packPageManyForHonoApi(deps, pages, me);
}

const iPagesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type IPagesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiIPages(
	deps: HonoApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	const params = parseHonoApiParams(iPagesParamDef, body) as IPagesParams;
	const { sinceId, untilId, order } = resolvePagePagination({ gen: (time) => genId(deps.config, time) }, params);

	const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return await packPageManyForHonoApi(deps, pages);
}

const iPageLikesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type IPageLikesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiIPageLikes(
	deps: HonoApiPageDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; page: Packed<'Page'> }[]> {
	const params = parseHonoApiParams(iPageLikesParamDef, body) as IPageLikesParams;

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
		sinceId = genId(deps.config, params.sinceDate);
		untilId = genId(deps.config, params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(deps.config, params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(deps.config, params.untilDate);
	}

	const likes = await listPageLikesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	if (likes.length === 0) return [];

	const pageIds = likes.map(like => like.pageId);
	const pageById = await listPagesByIdsFromDatabase(deps.db, pageIds)
		.then(pages => new Map(pages.map(pageEntity => [pageEntity.id, pageEntity])));
	const likesWithPages = likes.map(like => ({
		...like,
		page: pageById.get(like.pageId) ?? null,
	}));

	return await Promise.all(likesWithPages.map(like => packPageLikeForHonoApi(deps, like, me)));
}

const usersPagesParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;

type UsersPagesParams = {
	userId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiUsersPages(
	deps: HonoApiPageDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Page'>[]> {
	const params = parseHonoApiParams(usersPagesParamDef, body) as UsersPagesParams;
	const { sinceId, untilId, order } = resolvePagePagination({ gen: (time) => genId(deps.config, time) }, params);

	const pages = await listPagesByUserIdWithPaginationFromDatabase(deps.db, params.userId, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
		publicOnly: true,
	});

	return await packPageManyForHonoApi(deps, pages);
}
