/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { emoji, type EmojiInsert } from '@/db/schema/emoji.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
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
		return sortKeys.map((sortKey) => {
			const key = sortKey.replace(/^[+-]/, '') as keyof typeof emojiSortColumns;
			const column = emojiSortColumns[key];
			return sortKey.startsWith('-') ? desc(column) : asc(column);
		});
	}
	return [desc(emoji.id)];
}

function multipleWordsToPatterns(words: string): string[] {
	return words
		.split(/\s/)
		.filter((x) => x.length > 0)
		.map((x) => `%${sqlLikeEscape(x)}%`);
}

function likeAnyWords(column: AnyPgColumn, words: string): SQL {
	const patterns = multipleWordsToPatterns(words);
	return sql`${column} ~~ ANY(ARRAY[${sql.join(
		patterns.map((p) => sql`${p}`),
		sql`, `,
	)}])`;
}

export async function fetchEmojiByIdFromDatabase(db: MiDrizzleDatabase, id: MiEmoji['id']): Promise<MiEmoji | null> {
	const [row] = await db.select().from(emoji).where(eq(emoji.id, id)).limit(1);

	return row ?? null;
}

export async function fetchEmojiByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiEmoji['id']): Promise<MiEmoji> {
	const row = await fetchEmojiByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiEmoji, { id });
	}

	return row;
}

export async function listEmojisByIdsOrFailFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
): Promise<MiEmoji[]> {
	const emojis = await listEmojisByIdsFromDatabase(db, ids);
	const emojiById = new Map(emojis.map((row) => [row.id, row]));

	return ids.map((id) => {
		const row = emojiById.get(id);
		if (row == null) {
			throw new EntityNotFoundError(MiEmoji, { id });
		}
		return row;
	});
}

export async function fetchEmojiByNameAndHostFromDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<MiEmoji | null> {
	const [row] = await db
		.select()
		.from(emoji)
		.where(and(eq(emoji.name, name), host == null ? isNull(emoji.host) : eq(emoji.host, host)))
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

const EMOJI_CACHE_TTL_MS = 1000 * 60;
const EMOJI_CACHE_MAX_ENTRIES = 5000;
const emojiByNameAndHostCache = new Map<string, { row: MiEmoji | null; cachedAt: number }>();

function emojiCacheKey(name: MiEmoji['name'], host: MiEmoji['host']): string {
	return `${name}@${host ?? ''}`;
}

export function invalidateEmojiCache(): void {
	emojiByNameAndHostCache.clear();
}

/**
 * fetchEmojiByNameAndHostFromDatabase のプロセスローカル短命キャッシュ版 (原典 CustomEmojiService の
 * MemoryKVCache<MiEmoji | null> 相当。存在しない絵文字も null でキャッシュする)。
 * ノート/リアクション/AP レンダリングのカスタム絵文字解決 (絵文字1件=1クエリのホットパス) 専用。
 * このプロセスの書き込みは EmojiStore の書き込み関数内で同期無効化されるが、別プロセスの書き込みは
 * 最大 TTL (60秒) 遅れる。即時性が必要な管理系・単発参照系は非キャッシュ版を使うこと。
 */
export async function fetchEmojiByNameAndHostFromDatabaseCached(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<MiEmoji | null> {
	const key = emojiCacheKey(name, host);
	const hit = emojiByNameAndHostCache.get(key);
	if (hit != null && Date.now() - hit.cachedAt < EMOJI_CACHE_TTL_MS) {
		return hit.row;
	}

	const row = await fetchEmojiByNameAndHostFromDatabase(db, name, host);
	if (emojiByNameAndHostCache.size >= EMOJI_CACHE_MAX_ENTRIES) {
		emojiByNameAndHostCache.clear();
	}
	emojiByNameAndHostCache.set(key, { row, cachedAt: Date.now() });
	return row;
}

export async function fetchEmojisByNamesAndHostsFromDatabaseCached(
	db: MiDrizzleDatabase,
	queries: readonly { name: MiEmoji['name']; host: MiEmoji['host'] }[],
): Promise<(MiEmoji | null)[]> {
	if (queries.length === 0) return [];

	const now = Date.now();
	const resultByKey = new Map<string, MiEmoji | null>();
	const missingByKey = new Map<string, { name: MiEmoji['name']; host: MiEmoji['host'] }>();
	for (const query of queries) {
		const key = emojiCacheKey(query.name, query.host);
		const hit = emojiByNameAndHostCache.get(key);
		if (hit != null && now - hit.cachedAt < EMOJI_CACHE_TTL_MS) {
			resultByKey.set(key, hit.row);
		} else {
			missingByKey.set(key, query);
		}
	}

	if (missingByKey.size > 0) {
		const namesByHost = new Map<MiEmoji['host'], Set<MiEmoji['name']>>();
		for (const query of missingByKey.values()) {
			const names = namesByHost.get(query.host) ?? new Set<MiEmoji['name']>();
			names.add(query.name);
			namesByHost.set(query.host, names);
		}

		const rows = await db
			.select()
			.from(emoji)
			.where(
				or(
					...[...namesByHost.entries()].map(([host, names]) =>
						and(host == null ? isNull(emoji.host) : eq(emoji.host, host), inArray(emoji.name, [...names])),
					),
				),
			);
		const rowByKey = new Map(rows.map((row) => [emojiCacheKey(row.name, row.host), row]));

		if (emojiByNameAndHostCache.size + missingByKey.size > EMOJI_CACHE_MAX_ENTRIES) {
			emojiByNameAndHostCache.clear();
		}
		for (const [key] of missingByKey) {
			const row = rowByKey.get(key) ?? null;
			resultByKey.set(key, row);
			if (emojiByNameAndHostCache.size < EMOJI_CACHE_MAX_ENTRIES) {
				emojiByNameAndHostCache.set(key, { row, cachedAt: now });
			}
		}
	}

	return queries.map((query) => resultByKey.get(emojiCacheKey(query.name, query.host)) ?? null);
}

export async function listEmojisByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiEmoji['id'][]): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	return await db.select().from(emoji).where(inArray(emoji.id, ids));
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
		.where(and(eq(emoji.host, host), inArray(emoji.name, names)));
}

/**
 * CustomEmojiService の localEmojisCache (Redis) 向け。ローカル絵文字を全件取得する。
 * キャッシュのfetcherとして使われるホットパスなので、フィルタ条件を変えないこと。
 */
export async function listLocalEmojisFromDatabase(db: MiDrizzleDatabase): Promise<MiEmoji[]> {
	return await db.select().from(emoji).where(isNull(emoji.host));
}

/**
 * emojis エンドポイント向け。ローカル絵文字を category, name の昇順で取得する。
 */
export async function listLocalEmojisOrderedByCategoryAndNameFromDatabase(db: MiDrizzleDatabase): Promise<MiEmoji[]> {
	return await db.select().from(emoji).where(isNull(emoji.host)).orderBy(asc(emoji.category), asc(emoji.name));
}

/**
 * ExportCustomEmojisProcessorService 向け。ローカル絵文字を id の昇順で取得する。
 */
export async function listLocalEmojisOrderedByIdFromDatabase(db: MiDrizzleDatabase): Promise<MiEmoji[]> {
	return await db.select().from(emoji).where(isNull(emoji.host)).orderBy(asc(emoji.id));
}

export async function emojiExistsWithLocalNameInDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: emoji.id })
		.from(emoji)
		.where(and(eq(emoji.name, name), isNull(emoji.host)))
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
		.where(or(...queries.map((q) => and(eq(emoji.host, q.host), inArray(emoji.name, q.names)))));
}

export async function insertEmojiInDatabase(db: MiDrizzleDatabase, data: EmojiInsert): Promise<MiEmoji> {
	const [row] = await db.insert(emoji).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create emoji');
	}

	invalidateEmojiCache();
	return row;
}

export async function updateEmojiInDatabase(
	db: MiDrizzleDatabase,
	id: MiEmoji['id'],
	values: Partial<EmojiInsert>,
): Promise<void> {
	await db.update(emoji).set(values).where(eq(emoji.id, id));

	invalidateEmojiCache();
}

export async function updateEmojisByIdsInDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
	values: Partial<EmojiInsert>,
): Promise<void> {
	await updateEmojisByIdsReturningFromDatabase(db, ids, values);
	invalidateEmojiCache();
}

export async function updateEmojisByIdsReturningFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
	values: Partial<EmojiInsert>,
): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	const rows = await db.update(emoji).set(values).where(inArray(emoji.id, ids)).returning();

	return rows;
}

export async function addAliasesToEmojisByIdsInDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
	aliases: MiEmoji['aliases'],
	updatedAt: Date,
): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.update(emoji)
		.set({
			updatedAt,
			aliases: sql<MiEmoji['aliases']>`ARRAY(
				SELECT value
				FROM unnest(${emoji.aliases} || ${sql.param(aliases)}::character varying[]) WITH ORDINALITY AS input(value, position)
				GROUP BY value
				ORDER BY min(position)
			)`,
		})
		.where(inArray(emoji.id, ids))
		.returning();

	return rows;
}

export async function removeAliasesFromEmojisByIdsInDatabase(
	db: MiDrizzleDatabase,
	ids: MiEmoji['id'][],
	aliases: MiEmoji['aliases'],
	updatedAt: Date,
): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.update(emoji)
		.set({
			updatedAt,
			aliases: sql<MiEmoji['aliases']>`ARRAY(
				SELECT value
				FROM unnest(${emoji.aliases}) WITH ORDINALITY AS input(value, position)
				WHERE NOT EXISTS (
					SELECT 1
					FROM unnest(${sql.param(aliases)}::character varying[]) AS removed(value)
					WHERE input.value IS NOT DISTINCT FROM removed.value
				)
				ORDER BY position
			)`,
		})
		.where(inArray(emoji.id, ids))
		.returning();

	return rows;
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
		.where(and(eq(emoji.host, host), eq(emoji.name, name)))
		.returning();

	invalidateEmojiCache();
	return row ?? null;
}

export async function deleteEmojiByIdFromDatabase(db: MiDrizzleDatabase, id: MiEmoji['id']): Promise<void> {
	await db.delete(emoji).where(eq(emoji.id, id));

	invalidateEmojiCache();
}

export async function deleteEmojisByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiEmoji['id'][]): Promise<MiEmoji[]> {
	if (ids.length === 0) return [];

	const rows = await db.delete(emoji).where(inArray(emoji.id, ids)).returning();

	return rows;
}

/**
 * ImportCustomEmojisProcessorService 向け。名前衝突している既存絵文字を(name, host)で削除する。
 */
export async function deleteEmojiByNameAndHostFromDatabase(
	db: MiDrizzleDatabase,
	name: MiEmoji['name'],
	host: MiEmoji['host'],
): Promise<void> {
	await db.delete(emoji).where(and(eq(emoji.name, name), host == null ? isNull(emoji.host) : eq(emoji.host, host)));

	invalidateEmojiCache();
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
	const conditions: SQL[] = [options.host == null ? isNotNull(emoji.host) : eq(emoji.host, options.host)];

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
 * 既存検索のセマンティクス(LIKE ANY, aliasesのunnest部分一致, roleIdsのoverlapなど)を完全に再現する。
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
			conditions.push(sql`CAST(${emoji.updatedAt} AS DATE) >= ${q.updatedAtFrom}`);
		}
		if (q.updatedAtTo) {
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
					conditions.push(likeAnyWords(emoji.host, q.host));
				} else {
					conditions.push(isNotNull(emoji.host));
				}
				break;
			}
		}

		if (q.uri) {
			conditions.push(likeAnyWords(emoji.uri, q.uri));
		}
		if (q.publicUrl) {
			conditions.push(likeAnyWords(emoji.publicUrl, q.publicUrl));
		}
		if (q.type) {
			conditions.push(likeAnyWords(emoji.type, q.type));
		}
		if (q.aliases) {
			const patterns = multipleWordsToPatterns(q.aliases);
			conditions.push(
				sql`EXISTS (SELECT 1 FROM unnest(${emoji.aliases}) AS alias WHERE alias ~~ ANY(ARRAY[${sql.join(
					patterns.map((p) => sql`${p}`),
					sql`, `,
				)}]))`,
			);
		}
		if (q.category) {
			conditions.push(likeAnyWords(emoji.category, q.category));
		}
		if (q.license) {
			conditions.push(likeAnyWords(emoji.license, q.license));
		}
		if (q.isSensitive != null) {
			conditions.push(eq(emoji.isSensitive, q.isSensitive));
		}
		if (q.localOnly != null) {
			conditions.push(eq(emoji.localOnly, q.localOnly));
		}
		if (q.roleIds && q.roleIds.length > 0) {
			conditions.push(
				sql`${emoji.roleIdsThatCanBeUsedThisEmojiAsReaction} && ARRAY[${sql.join(
					q.roleIds.map((r) => sql`${r}`),
					sql`, `,
				)}]::varchar[]`,
			);
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
