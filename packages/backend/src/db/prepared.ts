/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getTableColumns, getTableName, is, SQL, Subquery } from 'drizzle-orm';
import type { DriverValueDecoder, Query } from 'drizzle-orm';
import { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { SelectedFields, SelectedFieldsOrdered } from 'drizzle-orm/pg-core';
import type { WithCacheConfig } from 'drizzle-orm/cache/core/types';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import Logger from '@/logger.js';

type QueryRecipe<T> = {
	query: { toSQL(): Query; then: PromiseLike<T>['then'] };
	joinsNotNullableMap?: Record<string, boolean>;
	cacheConfig?: WithCacheConfig;
} & (
	| { selection: SelectedFields; metadata: { type: 'select'; tables: string[] }; mutationTables?: never }
	| {
			selection?: SelectedFields;
			metadata: { type: 'insert' | 'update' | 'delete'; tables: string[] };
			/** 書込み対象の実行時 default / onUpdate を初回値で固定しない。 */
			mutationTables: PgTable[];
	  }
);

type CompiledQuery = Readonly<{
	query: Query;
	mapRows: ((rows: unknown[][]) => Record<string, unknown>[]) | undefined;
	metadata: QueryRecipe<unknown>['metadata'];
	cacheConfig: WithCacheConfig | undefined;
}>;

/**
 * 計画を使い回す接続 (名前付きの文) の db。ルートの db で実行した defineCachedQueryPlan の文だけをそちらへ回す。
 * transaction / savepoint の db は登録されないので、その接続のまま実行する。
 */
const planCacheDatabases = new WeakMap<MiDrizzleDatabase, MiDrizzleDatabase>();

const logger = new Logger('db').createSubLogger('prepared', 'gray');

/**
 * 名前付きの文は、準備した後に列の型が変わると (動作中に ALTER COLUMN ... TYPE を当てる等) その接続で失敗し続け、
 * Bun.sql は作り直さない。受けたら今の接続で実行し直し、以後はこの db の計画の使い回しを止める。
 */
function isStalePreparedPlanError(error: unknown): boolean {
	// drizzle は "Failed query: ..." で包み、PostgreSQL のエラーは cause に入る。
	for (let current: unknown = error; current instanceof Error; current = current.cause) {
		if (/cached plan must not change result type/.test(current.message)) return true;
	}
	return false;
}

export function registerPlanCacheDatabase(db: MiDrizzleDatabase, planCacheDb: MiDrizzleDatabase): void {
	planCacheDatabases.set(db, planCacheDb);
}

export function getPlanCacheDatabase(db: MiDrizzleDatabase): MiDrizzleDatabase | undefined {
	return planCacheDatabases.get(db);
}

export type QueryPlan<T> = {
	execute(db: MiDrizzleDatabase, values?: Record<string, unknown>): Promise<T>;
};

/** Drizzle と同じ列順・path を使い、decoder 自体は schema / SQL のものを保持する。 */
function orderSelection(selection: SelectedFields, prefix: string[] = []): SelectedFieldsOrdered {
	const ordered: SelectedFieldsOrdered = [];
	for (const [name, field] of Object.entries(selection)) {
		const path = [...prefix, name];
		if (is(field, PgColumn) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
			ordered.push({ path, field });
		} else {
			ordered.push(...orderSelection(is(field, PgTable) ? getTableColumns(field) : (field as SelectedFields), path));
		}
	}
	return ordered;
}

function compileRowMapper(
	fields: SelectedFieldsOrdered,
	joinsNotNullableMap: Record<string, boolean> | undefined,
): (rows: unknown[][]) => Record<string, unknown>[] {
	const columns = fields.map(({ path, field }) => {
		if (is(field, PgColumn)) return { path, decoder: field };
		const expression = is(field, SQL) ? field : is(field, Subquery) ? field._.sql : (field as SQL.Aliased).sql;
		// SQL.decoderは実装に存在するが、Drizzleの公開型には含まれない。
		const decoder = (expression as SQL & { decoder: DriverValueDecoder<unknown, unknown> }).decoder;
		return { path, decoder };
	});
	const nullable: Record<string, { key: string; table: string } | false> = {};
	if (joinsNotNullableMap !== undefined) {
		for (const { path, field } of fields) {
			if (path.length !== 2 || !is(field, PgColumn)) continue;
			const name = path[0]!;
			const table = getTableName(field.table);
			if (!(name in nullable)) nullable[name] = { key: path[1]!, table };
			else if (nullable[name] && nullable[name].table !== table) nullable[name] = false;
		}
	}
	const nullableObjects = Object.entries(nullable).flatMap(([name, group]) =>
		group && !joinsNotNullableMap?.[group.table] ? [{ name, key: group.key }] : [],
	);
	return (rows) =>
		rows.map((row) => {
			const result: Record<string, unknown> = {};
			for (let index = 0; index < columns.length; index++) {
				const { path, decoder } = columns[index]!;
				let target = result;
				for (let depth = 0; depth < path.length - 1; depth++) {
					const key = path[depth]!;
					if (!(key in target)) target[key] = {};
					target = target[key] as Record<string, unknown>;
				}
				const value = row[index];
				target[path[path.length - 1]!] = value === null ? null : decoder.mapFromDriverValue(value);
			}
			// Drizzle同様、同じtableの列だけで構成した直下のJOIN objectを判定する。
			for (const { name, key } of nullableObjects) {
				if ((result[name] as Record<string, unknown>)[key] === null) result[name] = null;
			}
			return result;
		});
}

/**
 * 計画を使い回してよい文。値によって最適な計画が変わらないもの (キーの等号・キーの配列・存在確認で引く読み取りと、
 * 条件の無い全件の読み取り) だけに使う。範囲や絞り込みで一致件数が大きく変わる文に使うと、generic plan に
 * 固定されて遅くなる。
 */
export function defineCachedQueryPlan<T>(recipe: (db: MiDrizzleDatabase) => QueryRecipe<T>): QueryPlan<T> {
	return createQueryPlan(recipe, true);
}

export function defineQueryPlan<T>(recipe: (db: MiDrizzleDatabase) => QueryRecipe<T>): QueryPlan<T> {
	return createQueryPlan(recipe, false);
}

/**
 * 宣言は静的な query 形状だけを閉じ込め、実行値・接続・認証状態は保持しない。
 * selection は同じ recipe 内で select / returning にも渡す。任意の prepared object の抽出や
 * all() の raw row 実行は扱わない。SQL と mapping の再利用と、session の寿命を分離する。
 */
function createQueryPlan<T>(recipe: (db: MiDrizzleDatabase) => QueryRecipe<T>, cachePlan: boolean): QueryPlan<T> {
	let compiled: CompiledQuery | undefined;
	return Object.freeze({
		async execute(db: MiDrizzleDatabase, values?: Record<string, unknown>): Promise<T> {
			let plan = compiled;
			if (plan === undefined) {
				const definition = recipe(db);
				plan = Object.freeze({
					query: definition.query.toSQL(),
					mapRows:
						definition.selection === undefined
							? undefined
							: compileRowMapper(orderSelection(definition.selection), definition.joinsNotNullableMap),
					metadata: definition.metadata,
					cacheConfig: definition.cacheConfig,
				});
				const dynamicDefaults = definition.mutationTables?.some((table) =>
					Object.values(getTableColumns(table)).some(
						(column) => column.defaultFn !== undefined || column.onUpdateFn !== undefined,
					),
				);
				if (!dynamicDefaults) compiled = plan;
			}
			// transaction / savepoint の session を保ち、計画キャッシュが有効な登録済みルート db だけ別接続へ回す。
			const run = (target: MiDrizzleDatabase) =>
				target._.session
					.prepareQuery<{ execute: T; all: unknown; values: unknown }>(
						plan.query,
						undefined,
						undefined,
						plan.mapRows !== undefined,
						plan.mapRows as ((rows: unknown[][]) => T) | undefined,
						plan.metadata,
						plan.cacheConfig,
					)
					.execute(values);
			const planCacheDb = cachePlan ? planCacheDatabases.get(db) : undefined;
			if (planCacheDb == null) {
				return await run(db);
			}
			try {
				return await run(planCacheDb);
			} catch (error) {
				if (!isStalePreparedPlanError(error)) throw error;
				planCacheDatabases.delete(db);
				logger.warn('A cached query plan became invalid after a schema change; stopped reusing plans until restart.');
				return await run(db);
			}
		},
	});
}
