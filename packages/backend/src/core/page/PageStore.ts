/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, ne, sql, type SQL } from 'drizzle-orm';
import { page, type PageInsert, type PageRow } from '@/db/schema/page.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiPage } from '@/models/Page.js';
import type { MiUser } from '@/models/User.js';

export type PageOrder = 'asc' | 'desc';

export type PageUpdateValues = {
	title?: string;
	name?: string;
	summary?: string | null;
	content?: Record<string, unknown>[];
	variables?: Record<string, unknown>[];
	script?: string;
	alignCenter?: boolean;
	hideTitleWhenPinned?: boolean;
	font?: 'serif' | 'sans-serif';
	eyeCatchingImageId?: string | null;
};

export type PageUpdateResult =
	| { status: 'not-found' }
	| { status: 'forbidden' }
	| { status: 'name-conflict' }
	| { status: 'ok'; before: MiPage; after: MiPage };

export type PageDeleteResult = { status: 'not-found' } | { status: 'forbidden' } | { status: 'ok'; page: MiPage };

function deserializePage(row: PageRow): MiPage {
	return {
		...row,
		user: null,
		eyeCatchingImage: null,
	} as MiPage;
}

function applyPagePaginationCondition(conditions: SQL[], sinceId?: string | null, untilId?: string | null): void {
	if (sinceId && untilId) {
		conditions.push(gt(page.id, sinceId));
		conditions.push(lt(page.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(page.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(page.id, untilId));
	}
}

export function resolvePagePagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId: string | null;
	untilId: string | null;
	order: PageOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function fetchPageByIdFromDatabase(db: MiDrizzleDatabase, id: MiPage['id']): Promise<MiPage | null> {
	const [row] = await db.select().from(page).where(eq(page.id, id)).limit(1);

	return row == null ? null : deserializePage(row);
}

export async function fetchPageByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiPage['id']): Promise<MiPage> {
	const found = await fetchPageByIdFromDatabase(db, id);

	if (found == null) {
		throw new EntityNotFoundError(MiPage, { id });
	}

	return found;
}

export async function fetchPageByNameAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	name: string,
	userId: MiUser['id'],
): Promise<MiPage | null> {
	const [row] = await db
		.select()
		.from(page)
		.where(and(eq(page.name, name), eq(page.userId, userId)))
		.limit(1);

	return row == null ? null : deserializePage(row);
}

export async function pageNameExistsForUserInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	name: string,
	excludeId?: MiPage['id'],
): Promise<boolean> {
	const conditions: SQL[] = [eq(page.userId, userId), eq(page.name, name)];

	if (excludeId != null) {
		conditions.push(ne(page.id, excludeId));
	}

	const [row] = await db
		.select({ id: page.id })
		.from(page)
		.where(and(...conditions))
		.limit(1);

	return row != null;
}

export async function createPageInDatabase(db: MiDrizzleDatabase, data: PageInsert): Promise<MiPage> {
	const [row] = await db.insert(page).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create page');
	}

	return deserializePage(row);
}

export async function updatePageContentInDatabase(
	db: MiDrizzleDatabase,
	id: MiPage['id'],
	content: Record<string, unknown>[],
): Promise<void> {
	await db.update(page).set({ content }).where(eq(page.id, id));
}

export async function updatePageInDatabase(
	db: MiDrizzleDatabase,
	id: MiPage['id'],
	userId: MiUser['id'],
	values: PageUpdateValues,
): Promise<PageUpdateResult> {
	return await db.transaction(async (tx) => {
		const [row] = await tx.select().from(page).where(eq(page.id, id)).for('no key update').limit(1);

		if (row == null) {
			return { status: 'not-found' };
		}

		const before = deserializePage(row);

		if (before.userId !== userId) {
			return { status: 'forbidden' };
		}

		if (values.name != null) {
			const conflicts = await pageNameExistsForUserInDatabase(tx, userId, values.name, id);
			if (conflicts) {
				return { status: 'name-conflict' };
			}
		}

		const [updated] = await tx
			.update(page)
			.set({
				updatedAt: new Date(),
				title: values.title,
				name: values.name,
				summary: values.summary === undefined ? before.summary : values.summary,
				content: values.content,
				variables: values.variables,
				script: values.script,
				alignCenter: values.alignCenter,
				hideTitleWhenPinned: values.hideTitleWhenPinned,
				font: values.font,
				eyeCatchingImageId: values.eyeCatchingImageId,
			})
			.where(eq(page.id, id))
			.returning();

		if (updated == null) {
			throw new Error('Failed to update page');
		}

		return { status: 'ok', before, after: deserializePage(updated) };
	});
}

export async function deletePageInDatabase(
	db: MiDrizzleDatabase,
	id: MiPage['id'],
	actor: { userId: MiUser['id']; isModerator: boolean },
): Promise<PageDeleteResult> {
	return await db.transaction(async (tx) => {
		const [row] = await tx.select().from(page).where(eq(page.id, id)).for('update').limit(1);

		if (row == null) {
			return { status: 'not-found' };
		}

		const deleted = deserializePage(row);

		if (!actor.isModerator && deleted.userId !== actor.userId) {
			return { status: 'forbidden' };
		}

		await tx.delete(page).where(eq(page.id, id));

		return { status: 'ok', page: deleted };
	});
}

export async function incrementPageLikedCountInDatabase(db: MiDrizzleDatabase, id: MiPage['id']): Promise<void> {
	await db
		.update(page)
		.set({ likedCount: sql`${page.likedCount} + 1` })
		.where(eq(page.id, id));
}

export async function decrementPageLikedCountInDatabase(db: MiDrizzleDatabase, id: MiPage['id']): Promise<void> {
	await db
		.update(page)
		.set({ likedCount: sql`${page.likedCount} - 1` })
		.where(eq(page.id, id));
}

export async function listPagesByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiPage['id'][]): Promise<MiPage[]> {
	if (ids.length === 0) return [];

	const rows = await db.select().from(page).where(inArray(page.id, ids));

	return rows.map(deserializePage);
}

export async function listPagesByUserIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: PageOrder;
		sinceId?: string | null;
		untilId?: string | null;
		publicOnly?: boolean;
	},
): Promise<MiPage[]> {
	const conditions: SQL[] = [eq(page.userId, userId)];

	if (options.publicOnly) {
		conditions.push(eq(page.visibility, 'public'));
	}

	applyPagePaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(page)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(page.id) : desc(page.id))
		.limit(options.limit);

	return rows.map(deserializePage);
}

export async function listFeaturedPagesFromDatabase(db: MiDrizzleDatabase): Promise<MiPage[]> {
	const rows = await db
		.select()
		.from(page)
		.where(and(eq(page.visibility, 'public'), gt(page.likedCount, 0)))
		.orderBy(desc(page.likedCount))
		.limit(10);

	return rows.map(deserializePage);
}
