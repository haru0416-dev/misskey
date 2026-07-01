/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { EntityNotFoundError } from 'typeorm';
import { emoji, type EmojiInsert } from '@/db/schema/emoji.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { MiEmoji } from '@/models/Emoji.js';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const emojiSortColumns = {
	id: emoji.id,
	updatedAt: emoji.updatedAt,
	name: emoji.name,
	host: emoji.host,
	uri: emoji.uri,
	publicUrl: emoji.publicUrl,
	type: emoji.type,
	aliases: emoji.aliases,
	category: emoji.category,
	license: emoji.license,
	isSensitive: emoji.isSensitive,
	localOnly: emoji.localOnly,
	roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
};

function resolveEmojiOrderBy(sortKeys?: readonly string[]) {
	if (sortKeys && sortKeys.length > 0) {
		return sortKeys.map(sortKey => {
			const key = sortKey.replace(/^[+-]/, '') as keyof typeof emojiSortColumns;
			const column = emojiSortColumns[key];
			return sortKey.startsWith('-') ? desc(column) : asc(column);
		});
	}
	return [desc(emoji.id)];
}

function multipleWordsToPatterns(words: string): string[] {
	return words.split(/\s/).filter(x => x.length > 0).map(x => `%${sqlLikeEscape(x)}%`);
}

function likeAnyWords(column: AnyPgColumn, words: string): SQL {
	const patterns = multipleWordsToPatterns(words);
	return sql`${column} ~~ ANY(ARRAY[${sql.join(patterns.map(p => sql`${p}`), sql`, `)}])`;
}

export async function fetchEmojiByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiEmoji['id'],
): Promise<MiEmoji | null> {
	const [row] = await db
		.select()
		.from(emoji)
		.where(eq(emoji.id, id))
		.limit(1);

	return row ?? null;
}

export async function fetchEmojiByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiEmoji['id'],
): Promise<MiEmoji> {
	const row = await fetchEmojiByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiEmoji, { id });
	}

	return row;
}

export async function fetchEmojiByNameAndHostFromDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<MiEmoji | null> {
	const [row] = await db
		.select()
		.from(emoji)
		.where(and(
			eq(emoji.name, name),
			host == null ? isNull(emoji.host) : eq(emoji.host, host),
		))
		.limit(1);

	return row ?? null;
}

export async function fetchEmojiByNameAndHostOrFailFromDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<MiEmoji> {
	const row = await fetchEmojiByNameAndHostFromDatabase(db, name, host);

	if (row == null) {
		throw new EntityNotFoundError(MiEmoji, { name, host });
	}

	return row;
}

export async function listEmojisByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	return await db
		.select()
		.from(emoji)
		.where(inArray(emoji.id, ids));
}

export async function listEmojisByHostAndNamesFromDatabase(
	db: MiDrizzleDatabase,
	host: NonNullable<MiEmoji['host']>,
	names: MiEmoji['name'][],
): Promise<MiEmoji[]> {
	if (names.length === 0) return [];

	return await db
		.select()
		.from(emoji)
		.where(and(
			eq(emoji.host, host),
			inArray(emoji.name, names),
		));
}

/**
 * CustomEmojiService の localEmojisCache (Redis) 向け。ローカル絵文字を全件取得する。
 * キャッシュのfetcherとして使われるホットパスなので、フィルタ条件を変えないこと。
 */
export async function listLocalEmojisFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiEmoji[]> {
	return await db
		.select()
		.from(emoji)
		.where(isNull(emoji.host));
}

/**
 * emojis エンドポイント向け。ローカル絵文字を category, name の昇順で取得する。
 */
export async function listLocalEmojisOrderedByCategoryAndNameFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiEmoji[]> {
	return await db
		.select()
		.from(emoji)
		.where(isNull(emoji.host))
		.orderBy(asc(emoji.category), asc(emoji.name));
}

/**
 * ExportCustomEmojisProcessorService 向け。ローカル絵文字を id の昇順で取得する。
 */
export async function listLocalEmojisOrderedByIdFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiEmoji[]> {
	return await db
		.select()
		.from(emoji)
		.where(isNull(emoji.host))
		.orderBy(asc(emoji.id));
}

export async function emojiExistsWithLocalNameInDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: emoji.id })
		.from(emoji)
		.where(and(
			eq(emoji.name, name),
			isNull(emoji.host),
		))
		.limit(1);

	return row != null;
}

/**
 * CustomEmojiService.prefetchEmojis 向け。(host, name[]) の組ごとにOR条件で絵文字のURL情報のみ取得する。
 */
export async function listEmojiThumbnailsByNamesAndHostsFromDatabase(
	db: MiDrizzleDatabase,
	queries: { names: string[]; host: string }[],
): Promise<Pick<MiEmoji, 'name' | 'host' | 'originalUrl' | 'publicUrl'>[]> {
	if (queries.length === 0) return [];

	return await db
		.select({
			name: emoji.name,
			host: emoji.host,
			originalUrl: emoji.originalUrl,
			publicUrl: emoji.publicUrl,
		})
		.from(emoji)
		.where(or(...queries.map(q => and(
			eq(emoji.host, q.host),
			inArray(emoji.name, q.names),
		))));
}

export async function insertEmojiInDatabase(
	db: MiDrizzleDatabase,
	data: EmojiInsert,
): Promise<MiEmoji> {
	const [row] = await db
		.insert(emoji)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create emoji');
	}

	return row;
}

export async function updateEmojiInDatabase(
	db: MiDrizzleDatabase,
	id: MiEmoji['id'],
	values: Partial<EmojiInsert>,
): Promise<void> {
	await db
		.update(emoji)
		.set(values)
		.where(eq(emoji.id, id));
}

export async function updateEmojisByIdsInDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
	values: Partial<EmojiInsert>,
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(emoji)
		.set(values)
		.where(inArray(emoji.id, ids));
}

/**
 * ApNoteService.extractEmojis 向け。(host, name) で絵文字を更新し、更新後の行を返す。
 * host, name はunique indexなので高々1行のみ更新される。
 */
export async function updateEmojiByHostAndNameInDatabase(
	db: MiDrizzleDatabase,
	host: NonNullable<MiEmoji['host']>,
	name: MiEmoji['name'],
	values: Partial<EmojiInsert>,
): Promise<MiEmoji | null> {
	const [row] = await db
		.update(emoji)
		.set(values)
		.where(and(
			eq(emoji.host, host),
			eq(emoji.name, name),
		))
		.returning();

	return row ?? null;
}

export async function deleteEmojiByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiEmoji['id'],
): Promise<void> {
	await db
		.delete(emoji)
		.where(eq(emoji.id, id));
}

/**
 * ImportCustomEmojisProcessorService 向け。名前衝突している既存絵文字を(name, host)で削除する。
 */
export async function deleteEmojiByNameAndHostFromDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<void> {
	await db
		.delete(emoji)
		.where(and(
			eq(emoji.name, name),
			host == null ? isNull(emoji.host) : eq(emoji.host, host),
		));
}

/**
 * admin/emoji/list 向け。ローカル絵文字をID基準でページネーションして取得する。
 * `limit`を指定しない場合は(呼び出し元でJS側フィルタを行うため)全件取得する。
 */
export async function listLocalEmojisPageFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		order: 'asc' | 'desc';
		sinceId?: string | null;
		untilId?: string | null;
		limit?: number;
	},
): Promise<MiEmoji[]> {
	const conditions: SQL[] = [isNull(emoji.host)];

	if (options.sinceId) conditions.push(gt(emoji.id, options.sinceId));
	if (options.untilId) conditions.push(lt(emoji.id, options.untilId));

	let query = db
		.select()
		.from(emoji)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(emoji.id) : desc(emoji.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	return await query;
}

/**
 * admin/emoji/list-remote 向け。リモート絵文字(または特定host)をID降順でページネーションして取得する。
 */
export async function listRemoteEmojisPageFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		host: string | null;
		query?: string | null;
		sinceId?: string | null;
		untilId?: string | null;
		limit: number;
	},
): Promise<MiEmoji[]> {
	const conditions: SQL[] = [
		options.host == null ? isNotNull(emoji.host) : eq(emoji.host, options.host),
	];

	if (options.sinceId) conditions.push(gt(emoji.id, options.sinceId));
	if (options.untilId) conditions.push(lt(emoji.id, options.untilId));
	if (options.query) {
		conditions.push(sql`${emoji.name} like ${'%' + sqlLikeEscape(options.query) + '%'}`);
	}

	return await db
		.select()
		.from(emoji)
		.where(and(...conditions))
		.orderBy(desc(emoji.id))
		.limit(options.limit);
}

/**
 * CustomEmojiService.fetchEmojis 向け。admin向け絵文字検索。
 * TypeORM QueryBuilder時代のセマンティクス(LIKE ANY, aliasesのunnest部分一致, roleIdsのoverlapなど)を完全に再現する。
 */
export async function fetchEmojisFromDatabase(
	db: MiDrizzleDatabase,
	params?: {
		query?: {
			updatedAtFrom?: string;
			updatedAtTo?: string;
			name?: string;
			host?: string;
			uri?: string;
			publicUrl?: string;
			type?: string;
			aliases?: string;
			category?: string;
			license?: string;
			isSensitive?: boolean;
			localOnly?: boolean;
			hostType?: 'local' | 'remote' | 'all';
			roleIds?: string[];
		};
		sinceId?: string;
		untilId?: string;
	},
	opts?: {
		limit?: number;
		page?: number;
		sortKeys?: readonly string[];
	},
): Promise<{ emojis: MiEmoji[]; allCount: number }> {
	const conditions: SQL[] = [];

	if (params?.query) {
		const q = params.query;

		if (q.updatedAtFrom) {
			// noIndexScan
			conditions.push(sql`CAST(${emoji.updatedAt} AS DATE) >= ${q.updatedAtFrom}`);
		}
		if (q.updatedAtTo) {
			// noIndexScan
			conditions.push(sql`CAST(${emoji.updatedAt} AS DATE) <= ${q.updatedAtTo}`);
		}
		if (q.name) {
			conditions.push(likeAnyWords(emoji.name, q.name));
		}

		switch (true) {
			case q.hostType === 'local': {
				conditions.push(isNull(emoji.host));
				break;
			}
			case q.hostType === 'remote': {
				if (q.host) {
					// noIndexScan
					conditions.push(likeAnyWords(emoji.host, q.host));
				} else {
					conditions.push(isNotNull(emoji.host));
				}
				break;
			}
		}

		if (q.uri) {
			// noIndexScan
			conditions.push(likeAnyWords(emoji.uri, q.uri));
		}
		if (q.publicUrl) {
			// noIndexScan
			conditions.push(likeAnyWords(emoji.publicUrl, q.publicUrl));
		}
		if (q.type) {
			// noIndexScan
			conditions.push(likeAnyWords(emoji.type, q.type));
		}
		if (q.aliases) {
			// noIndexScan
			const patterns = multipleWordsToPatterns(q.aliases);
			conditions.push(sql`EXISTS (SELECT 1 FROM unnest(${emoji.aliases}) AS alias WHERE alias ~~ ANY(ARRAY[${sql.join(patterns.map(p => sql`${p}`), sql`, `)}]))`);
		}
		if (q.category) {
			conditions.push(likeAnyWords(emoji.category, q.category));
		}
		if (q.license) {
			// noIndexScan
			conditions.push(likeAnyWords(emoji.license, q.license));
		}
		if (q.isSensitive != null) {
			// noIndexScan
			conditions.push(eq(emoji.isSensitive, q.isSensitive));
		}
		if (q.localOnly != null) {
			// noIndexScan
			conditions.push(eq(emoji.localOnly, q.localOnly));
		}
		if (q.roleIds && q.roleIds.length > 0) {
			conditions.push(sql`${emoji.roleIdsThatCanBeUsedThisEmojiAsReaction} && ARRAY[${sql.join(q.roleIds.map(r => sql`${r}`), sql`, `)}]::varchar[]`);
		}
	}

	if (params?.sinceId) {
		conditions.push(gt(emoji.id, params.sinceId));
	}
	if (params?.untilId) {
		conditions.push(lt(emoji.id, params.untilId));
	}

	const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;
	const limit = opts?.limit ?? 10;

	let query = db
		.select()
		.from(emoji)
		.where(whereExpr)
		.orderBy(...resolveEmojiOrderBy(opts?.sortKeys))
		.$dynamic();

	query = query.limit(limit);

	if (opts?.page) {
		query = query.offset((opts.page - 1) * limit);
	}

	const rows = await query;
	const [countRow] = await db.select({ count: count() }).from(emoji).where(whereExpr);

	return {
		emojis: rows,
		allCount: countRow?.count ?? 0,
	};
}
