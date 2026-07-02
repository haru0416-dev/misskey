/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { desc, eq } from 'drizzle-orm';
import { meta as metaTable, type MetaInsert, type MetaRow } from '@/db/schema/meta.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';

type MetaUpdate = Partial<Omit<MetaInsert, 'id'>>;

function deserializeMeta(row: MetaRow): MiMeta {
	return {
		...row,
		rootUser: null,
	} as MiMeta;
}

function toMetaUpdate(data: Partial<MiMeta>): MetaUpdate {
	const { id, rootUser, ...columns } = data;
	return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined)) as MetaUpdate;
}

export async function fetchMetaFromDatabase(db: MiDrizzleDatabase): Promise<MiMeta> {
	return await db.transaction(async (tx) => {
		const [existing] = await tx.select().from(metaTable).orderBy(desc(metaTable.id)).limit(1);

		if (existing) {
			return deserializeMeta(existing);
		}

		await tx.insert(metaTable).values({ id: 'x' }).onConflictDoNothing({ target: metaTable.id });

		const [saved] = await tx.select().from(metaTable).where(eq(metaTable.id, 'x')).limit(1);

		if (!saved) {
			throw new Error('Meta row was not created');
		}

		return deserializeMeta(saved);
	});
}

export async function updateMetaInDatabase(db: MiDrizzleDatabase, data: Partial<MiMeta>): Promise<{
	before: MiMeta | undefined;
	after: MiMeta;
}> {
	let before: MiMeta | undefined;
	const update = toMetaUpdate(data);

	const after = await db.transaction(async (tx) => {
		const [beforeRow] = await tx.select().from(metaTable).orderBy(desc(metaTable.id)).limit(1);
		before = beforeRow ? deserializeMeta(beforeRow) : undefined;

		if (before) {
			if (Object.keys(update).length > 0) {
				await tx.update(metaTable).set(update).where(eq(metaTable.id, before.id));
			}
		} else {
			await tx.insert(metaTable).values({
				...update,
				id: 'x',
			});
		}

		const [afterRow] = await tx.select().from(metaTable).orderBy(desc(metaTable.id)).limit(1);

		if (!afterRow) {
			throw new Error('Meta row was not found after update');
		}

		return deserializeMeta(afterRow);
	});

	return { before, after };
}
