/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { dateUTC, isTimeSame, isTimeBefore, subtractTime, addTime } from '@/misc/prelude/time.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

const COLUMN_PREFIX = '___' as const;
const UNIQUE_TEMP_COLUMN_PREFIX = 'unique_temp___' as const;
const COLUMN_DELIMITER = '_' as const;

type Schema = Record<string, {
	uniqueIncrement?: boolean;

	intersection?: string[] | ReadonlyArray<string>;

	range?: 'big' | 'small' | 'medium';

	accumulate?: boolean;
}>;

type ChartColumnDefinition = {
	type: 'integer' | 'bigint' | 'smallint' | 'varchar';
	array?: boolean;
	default?: string | number;
	generated?: boolean;
	length?: number;
};

export type ChartEntity = {
	name: string;
	tableName: string;
	columns: Record<string, ChartColumnDefinition>;
	uniqueColumns: string[];
};

type KeyToColumnName<T extends string> = T extends `${infer R1}.${infer R2}` ? `${R1}${typeof COLUMN_DELIMITER}${KeyToColumnName<R2>}` : T;

type Columns<S extends Schema> = {
	[K in keyof S as `${typeof COLUMN_PREFIX}${KeyToColumnName<string & K>}`]: number;
};

type TempColumnsForUnique<S extends Schema> = {
	[K in keyof S as `${typeof UNIQUE_TEMP_COLUMN_PREFIX}${KeyToColumnName<string & K>}`]: S[K]['uniqueIncrement'] extends true ? string[] : never;
};

type RawRecord<S extends Schema> = {
	id: number;

	group?: string | null;

	date: number;
} & TempColumnsForUnique<S> & Columns<S>;

const camelToSnake = (str: string): string => {
	return str.replace(/([A-Z])/g, s => '_' + s.charAt(0).toLowerCase());
};

const removeDuplicates = <T,>(array: T[]) => Array.from(new Set(array));

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const identifierSql = (value: string): SQL => sql.raw(quoteIdentifier(value));

const hashedRelationName = (prefix: string, ...parts: string[]): string => {
	const hash = createHash('sha1').update(parts.join('\0')).digest('hex').slice(0, 32);
	return `${prefix}_${hash}`;
};

const arrayValueSql = (value: unknown[]): SQL => {
	return sql`ARRAY[${sql.join(value.map(item => sql`${item}`), sql`, `)}]::varchar[]`;
};

const assignmentValueSql = (value: number | SQL | unknown[]): SQL => {
	if (Array.isArray(value)) {
		return arrayValueSql(value);
	}

	return sql`${value}`;
};

type Commit<S extends Schema> = {
	[K in keyof S]?: S[K]['uniqueIncrement'] extends true ? string[] : number;
};

export type KVs<S extends Schema> = {
	[K in keyof S]: number;
};

type ChartResult<T extends Schema> = {
	[P in keyof T]: number[];
};

type UnionToIntersection<T> = (T extends any ? (x: T) => any : never) extends (x: infer R) => any ? R : never;

type UnflattenSingleton<K extends string, V> = K extends `${infer A}.${infer B}`
	? { [_ in A]: UnflattenSingleton<B, V>; }
	: { [_ in K]: V; };

type Unflatten<T extends Record<string, unknown>> = UnionToIntersection<
	{
		[K in Extract<keyof T, string>]: UnflattenSingleton<K, T[K]>;
	}[Extract<keyof T, string>]
>;

type ToJsonSchema<S> = {
	type: 'object';
	properties: {
		[K in keyof S]: S[K] extends number[] ? { type: 'array'; items: { type: 'number'; }; } : ToJsonSchema<S[K]>;
	},
	required: (keyof S)[];
};

type JsonSchemaBuilderNode = {
	type: 'object' | 'array';
	properties?: Record<string, JsonSchemaBuilderNode>;
	items?: { type: 'number' };
	required?: string[];
};

export function getJsonSchema<S extends Schema>(schema: S): ToJsonSchema<Unflatten<ChartResult<S>>> {
	const unflatten = (str: string, parent: JsonSchemaBuilderNode) => {
		const keys = str.split('.');
		const key = keys.shift();
		const nextKey = keys[0];

		if (key == null) return;

		parent.properties ??= {};
		if (parent.properties[key] == null) {
			parent.properties[key] = nextKey ? {
				type: 'object',
				properties: {},
				required: [],
			} : {
				type: 'array',
				items: {
					type: 'number',
				},
			};
		}

		if (nextKey) unflatten(keys.join('.'), parent.properties[key]);
	};

	const jsonSchema: JsonSchemaBuilderNode = {
		type: 'object',
		properties: {},
		required: [],
	};

	for (const k in schema) {
		unflatten(k, jsonSchema);
	}

	return jsonSchema as ToJsonSchema<Unflatten<ChartResult<S>>>;
}

// eslint-disable-next-line import/no-default-export
export default abstract class Chart<T extends Schema> {
	private logger: Logger;

	public schema: T;

	private name: string;
	private buffer: {
		diff: Commit<T>;
		group: string | null;
	}[] = [];
	private tableForHour: string;
	private tableForDay: string;
	private chartDb: MiDrizzleDatabase;

	/**
	 * 1日に一回程度実行されれば良いような計算処理を入れる(主にCASCADE削除などアプリケーション側で感知できない変動によるズレの修正用)
	 */
	protected abstract tickMajor(group: string | null): Promise<Partial<KVs<T>>>;

	/**
	 * 少なくとも最小スパン内に1回は実行されて欲しい計算処理を入れる
	 */
	protected abstract tickMinor(group: string | null): Promise<Partial<KVs<T>>>;

	private static convertSchemaToColumnDefinitions(schema: Schema): Record<string, ChartColumnDefinition> {
		const columns = {} as Record<string, ChartColumnDefinition>;
		for (const [k, v] of Object.entries(schema)) {
			const name = k.replaceAll('.', COLUMN_DELIMITER);
			const type = v.range === 'big' ? 'bigint' : v.range === 'small' ? 'smallint' : 'integer';
			if (v.uniqueIncrement) {
				columns[UNIQUE_TEMP_COLUMN_PREFIX + name] = {
					type: 'varchar',
					array: true,
					default: '{}',
				};
				columns[COLUMN_PREFIX + name] = {
					type,
					default: 0,
				};
			} else {
				columns[COLUMN_PREFIX + name] = {
					type,
					default: 0,
				};
			}
		}
		return columns;
	}

	private static dateToTimestamp(x: Date): number {
		return Math.floor(x.getTime() / 1000);
	}

	private static parseDate(date: Date): [number, number, number, number, number, number, number] {
		const y = date.getUTCFullYear();
		const m = date.getUTCMonth();
		const d = date.getUTCDate();
		const h = date.getUTCHours();
		const _m = date.getUTCMinutes();
		const _s = date.getUTCSeconds();
		const _ms = date.getUTCMilliseconds();

		return [y, m, d, h, _m, _s, _ms];
	}

	private static getCurrentDate() {
		return Chart.parseDate(new Date());
	}

	private static defaultValueSql(value: string | number): string {
		return typeof value === 'number' ? value.toString() : `'${value.replaceAll('\'', '\'\'')}'`;
	}

	private static columnDefinitionSql(name: string, definition: ChartColumnDefinition): string {
		const type =
			definition.generated ? 'SERIAL' :
			definition.array ? `${definition.type}[]` :
			definition.type === 'varchar' && definition.length != null ? `character varying(${definition.length})` :
			definition.type;
		const defaultValue = definition.default == null ? '' : ` DEFAULT ${Chart.defaultValueSql(definition.default)}`;

		return `${quoteIdentifier(name)} ${type} NOT NULL${defaultValue}`;
	}

	public static entityToCreateTableSql(entity: ChartEntity): string[] {
		const uniqueColumns = entity.uniqueColumns.map(column => quoteIdentifier(column)).join(', ');
		const tableName = quoteIdentifier(entity.tableName);
		const columns = Object.entries(entity.columns).map(([name, definition]) => Chart.columnDefinitionSql(name, definition));
		const relationKey = [entity.tableName, ...entity.uniqueColumns].join(':');

		return [
			`CREATE TABLE ${tableName} (${[
				...columns,
				`CONSTRAINT ${quoteIdentifier(hashedRelationName('UQ', relationKey))} UNIQUE (${uniqueColumns})`,
				`CONSTRAINT ${quoteIdentifier(hashedRelationName('PK', entity.tableName, 'id'))} PRIMARY KEY ("id")`,
			].join(', ')})`,
			`CREATE UNIQUE INDEX ${quoteIdentifier(hashedRelationName('IDX', relationKey))} ON ${tableName} (${uniqueColumns})`,
		];
	}

	public static schemaToEntity(name: string, schema: Schema, grouped = false): {
		hour: ChartEntity,
		day: ChartEntity,
	} {
		const createEntity = (span: 'hour' | 'day'): ChartEntity => ({
			name:
				span === 'hour' ? `ChartX${name}` :
				span === 'day' ? `ChartDayX${name}` :
				new Error('not happen') as never,
			tableName:
				span === 'hour' ? `__chart__${camelToSnake(name)}` :
				span === 'day' ? `__chart_day__${camelToSnake(name)}` :
				new Error('not happen') as never,
			columns: {
				id: {
					type: 'integer',
					generated: true,
				},
				date: {
					type: 'integer',
				},
				...(grouped ? {
					group: {
						type: 'varchar',
						length: 128,
					},
				} : {}),
				...Chart.convertSchemaToColumnDefinitions(schema),
			},
			uniqueColumns: grouped ? ['date', 'group'] : ['date'],
		});

		return {
			hour: createEntity('hour'),
			day: createEntity('day'),
		};
	}

	private lock: (key: string) => Promise<() => void>;

	constructor(
		db: MiDrizzleDatabase,
		lock: (key: string) => Promise<() => void>,
		logger: Logger,
		name: string,
		schema: T,
		grouped = false,
	) {
		this.name = name;
		this.schema = schema;
		this.lock = lock;
		this.logger = logger;
		this.chartDb = db;

		this.tableForHour = `__chart__${camelToSnake(name)}`;
		this.tableForDay = `__chart_day__${camelToSnake(name)}`;
	}

	private getTable(span: 'hour' | 'day'): string {
		return span === 'hour' ? this.tableForHour : this.tableForDay;
	}

	private groupCondition(group: string | null): SQL {
		return group ? sql`AND "group" = ${group}` : sql``;
	}

	private async getLogByDate(group: string | null, span: 'hour' | 'day', date: number): Promise<RawRecord<T> | null> {
		const result = await this.chartDb.execute(sql`
			SELECT *
			FROM ${identifierSql(this.getTable(span))}
			WHERE "date" = ${date}
				${this.groupCondition(group)}
			LIMIT 1
		`);

		return result.rows[0] as RawRecord<T> | undefined ?? null;
	}

	private async insertLog(span: 'hour' | 'day', values: Record<string, number | string | null | unknown[]>): Promise<RawRecord<T>> {
		const entries = Object.entries(values);
		const result = await this.chartDb.execute(sql`
			INSERT INTO ${identifierSql(this.getTable(span))}
				(${sql.join(entries.map(([column]) => identifierSql(column)), sql`, `)})
			VALUES
				(${sql.join(entries.map(([, value]) => sql`${value}`), sql`, `)})
			RETURNING *
		`);

		return result.rows[0] as RawRecord<T>;
	}

	private async updateLogById(span: 'hour' | 'day', id: number, values: Record<string, number | SQL | unknown[]>): Promise<void> {
		const entries = Object.entries(values);
		if (entries.length === 0) return;

		await this.chartDb.execute(sql`
			UPDATE ${identifierSql(this.getTable(span))}
			SET ${sql.join(entries.map(([column, value]) => sql`${identifierSql(column)} = ${assignmentValueSql(value)}`), sql`, `)}
			WHERE "id" = ${id}
		`);
	}

	private async updateLogsByDateRange(span: 'hour' | 'day', gt: number, lt: number, values: Record<string, unknown[]>): Promise<void> {
		const entries = Object.entries(values);
		if (entries.length === 0) return;

		await this.chartDb.execute(sql`
			UPDATE ${identifierSql(this.getTable(span))}
			SET ${sql.join(entries.map(([column, value]) => sql`${identifierSql(column)} = ${assignmentValueSql(value)}`), sql`, `)}
			WHERE "date" > ${gt}
				AND "date" < ${lt}
		`);
	}

	@bindThis
	private convertRawRecord(x: RawRecord<T>): KVs<T> {
		const kvs = {} as Record<string, number>;
		for (const k of Object.keys(x).filter((k) => k.startsWith(COLUMN_PREFIX)) as (keyof Columns<T>)[]) {
			kvs[(k as string).substring(COLUMN_PREFIX.length).split(COLUMN_DELIMITER).join('.')] = x[k] as unknown as number;
		}
		return kvs as KVs<T>;
	}

	@bindThis
	private getNewLog(latest: KVs<T> | null): KVs<T> {
		const log = {} as Record<keyof T, number>;
		for (const [k, v] of Object.entries(this.schema) as ([keyof typeof this['schema'], this['schema'][string]])[]) {
			if (v.accumulate && latest) {
				log[k] = latest[k];
			} else {
				log[k] = 0;
			}
		}
		return log as KVs<T>;
	}

	@bindThis
	private getLatestLog(group: string | null, span: 'hour' | 'day'): Promise<RawRecord<T> | null> {
		return this.chartDb.execute(sql`
			SELECT *
			FROM ${identifierSql(this.getTable(span))}
			WHERE TRUE
				${this.groupCondition(group)}
			ORDER BY "date" DESC
			LIMIT 1
		`).then(result => result.rows[0] as RawRecord<T> | undefined ?? null);
	}

	/**
	 * 現在(=今のHour or Day)のログをデータベースから探して、あればそれを返し、なければ作成して返します。
	 */
	@bindThis
	private async claimCurrentLog(group: string | null, span: 'hour' | 'day'): Promise<RawRecord<T>> {
		const [y, m, d, h] = Chart.getCurrentDate();

		const current = dateUTC(
			span === 'hour' ? [y, m, d, h] :
			span === 'day' ? [y, m, d] :
			new Error('not happen') as never);

		// 現在(=今のHour or Day)のログ
		const currentLog = await this.getLogByDate(group, span, Chart.dateToTimestamp(current));

		// ログがあればそれを返して終了
		if (currentLog != null) {
			return currentLog;
		}

		let log: RawRecord<T>;
		let data: KVs<T>;

		// 集計期間が変わってから、初めてのチャート更新なら
		// 最も最近のログを持ってくる
		// * 例えば集計期間が「日」である場合で考えると、
		// * 昨日何もチャートを更新するような出来事がなかった場合は、
		// * ログがそもそも作られずドキュメントが存在しないということがあり得るため、
		// * 「昨日の」と決め打ちせずに「もっとも最近の」とします
		const latest = await this.getLatestLog(group, span);

		if (latest != null) {
			// 空ログデータを作成
			data = this.getNewLog(this.convertRawRecord(latest));
		} else {
			// ログが存在しなかったら
			// (Misskeyインスタンスを建てて初めてのチャート更新時など)

			// 初期ログデータを作成
			data = this.getNewLog(null);

			this.logger.info(`${this.name + (group ? `:${group}` : '')}(${span}): Initial commit created`);
		}

		const date = Chart.dateToTimestamp(current);
		const lockKey = group ? `${this.name}:${date}:${span}:${group}` : `${this.name}:${date}:${span}`;

		const unlock = await this.lock(lockKey);
		try {
			// ロック内でもう1回チェックする
			const currentLog = await this.getLogByDate(group, span, date);

			// ログがあればそれを返して終了
			if (currentLog != null) return currentLog;

			const columns = {} as Record<string, number | unknown[]>;
			for (const [k, v] of Object.entries(data)) {
				const name = k.replaceAll('.', COLUMN_DELIMITER);
				columns[COLUMN_PREFIX + name] = v;
			}

			// 新規ログ挿入
			log = await this.insertLog(span, {
				date: date,
				...(group ? { group: group } : {}),
				...columns,
			});

			this.logger.info(`${this.name + (group ? `:${group}` : '')}(${span}): New commit created`);

			return log;
		} finally {
			unlock();
		}
	}

	protected commit(diff: Commit<T>, group: string | null = null): void {
		for (const [k, v] of Object.entries(diff)) {
			if (v == null || v === 0 || (Array.isArray(v) && v.length === 0)) delete diff[k];
		}
		this.buffer.push({
			diff, group,
		});
	}

	@bindThis
	public async save(): Promise<void> {
		if (this.buffer.length === 0) {
			this.logger.info(`${this.name}: Write skipped`);
			return;
		}

		// TODO: 前の時間のログがbufferにあった場合のハンドリング
		// 例えば、save が20分ごとに行われるとして、前回行われたのは 01:50 だったとする。
		// 次に save が行われるのは 02:10 ということになるが、もし 01:55 に新規ログが buffer に追加されたとすると、
		// そのログは本来は 01:00~ のログとしてDBに保存されて欲しいのに、02:00~ のログ扱いになってしまう。
		// これを回避するための実装は複雑になりそうなため、一旦保留。
		const buffer = this.buffer.slice();

		const update = async (logHour: RawRecord<T>, logDay: RawRecord<T>): Promise<void> => {
			const finalDiffs = {} as Record<string, number | string[]>;

			const bufferedDiffs = buffer.filter(q => q.group == null || (q.group === logHour.group));
			for (const { diff } of bufferedDiffs) {
				for (const [k, v] of Object.entries(diff)) {
					if (finalDiffs[k] == null) {
						finalDiffs[k] = v;
					} else {
						if (typeof finalDiffs[k] === 'number') {
							(finalDiffs[k] as number) += v as number;
						} else {
							(finalDiffs[k] as string[]) = (finalDiffs[k] as string[]).concat(v);
						}
					}
				}
			}

			const queryForHour: Record<string, number | SQL> = {};
			const queryForDay: Record<string, number | SQL> = {};
			for (const [k, v] of Object.entries(finalDiffs)) {
				if (typeof v === 'number') {
					const name = COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as string & keyof Columns<T>;
					if (v > 0) queryForHour[name] = sql`${identifierSql(name)} + ${v}`;
					if (v < 0) queryForHour[name] = sql`${identifierSql(name)} - ${Math.abs(v)}`;
					if (v > 0) queryForDay[name] = sql`${identifierSql(name)} + ${v}`;
					if (v < 0) queryForDay[name] = sql`${identifierSql(name)} - ${Math.abs(v)}`;
				} else if (Array.isArray(v) && v.length > 0) { // ユニークインクリメント
					const tempColumnName = UNIQUE_TEMP_COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as string & keyof TempColumnsForUnique<T>;
					const itemsForHour = v.filter(item => !(logHour[tempColumnName] as unknown as string[]).includes(item));
					const itemsForDay = v.filter(item => !(logDay[tempColumnName] as unknown as string[]).includes(item));
					if (itemsForHour.length > 0) queryForHour[tempColumnName] = sql`array_cat(${identifierSql(tempColumnName)}, ${arrayValueSql(itemsForHour)})`;
					if (itemsForDay.length > 0) queryForDay[tempColumnName] = sql`array_cat(${identifierSql(tempColumnName)}, ${arrayValueSql(itemsForDay)})`;
				}
			}

			for (const [k, v] of Object.entries(finalDiffs)) {
				const schema = this.schema[k];
				if (schema == null) throw new Error(`Unknown chart field: ${k}`);
				if (schema.uniqueIncrement) {
					const name = COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as keyof Columns<T>;
					const tempColumnName = UNIQUE_TEMP_COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as keyof TempColumnsForUnique<T>;
					const cardinalityOfHour = new Set([...(v as string[]), ...(logHour[tempColumnName] as unknown as string[])]).size;
					const cardinalityOfDay = new Set([...(v as string[]), ...(logDay[tempColumnName] as unknown as string[])]).size;
					queryForHour[name] = cardinalityOfHour;
					queryForDay[name] = cardinalityOfDay;
				}
			}

			// TODO: intersectionに指定されたカラムがintersectionだった場合の対応
			for (const [k, v] of Object.entries(this.schema)) {
				const intersection = v.intersection;
				if (intersection) {
					const name = COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as keyof Columns<T>;
					const [firstKey, ...remainingKeys] = intersection;
					if (firstKey == null) continue;
					const firstTempColumnName = UNIQUE_TEMP_COLUMN_PREFIX + firstKey.replaceAll('.', COLUMN_DELIMITER) as keyof TempColumnsForUnique<T>;
					const firstValues = finalDiffs[firstKey] as string[] | undefined;
					const currentValuesForHour = new Set([...(firstValues ?? []), ...(logHour[firstTempColumnName] as unknown as string[])]);
					const currentValuesForDay = new Set([...(firstValues ?? []), ...(logDay[firstTempColumnName] as unknown as string[])]);
					for (const targetKey of remainingKeys) {
						const targetTempColumnName = UNIQUE_TEMP_COLUMN_PREFIX + targetKey.replaceAll('.', COLUMN_DELIMITER) as keyof TempColumnsForUnique<T>;
						const targetValues = finalDiffs[targetKey] as string[] | undefined;
						const targetValuesForHour = new Set([...(targetValues ?? []), ...(logHour[targetTempColumnName] as unknown as string[])]);
						const targetValuesForDay = new Set([...(targetValues ?? []), ...(logDay[targetTempColumnName] as unknown as string[])]);
						currentValuesForHour.forEach(v => {
							if (!targetValuesForHour.has(v)) currentValuesForHour.delete(v);
						});
						currentValuesForDay.forEach(v => {
							if (!targetValuesForDay.has(v)) currentValuesForDay.delete(v);
						});
					}
					queryForHour[name] = currentValuesForHour.size;
					queryForDay[name] = currentValuesForDay.size;
				}
			}

			// ログ更新
			await Promise.all([
				this.updateLogById('hour', logHour.id, queryForHour),
				this.updateLogById('day', logDay.id, queryForDay),
			]);

			this.logger.info(`${this.name + (logHour.group ? `:${logHour.group}` : '')}: Updated`);

			const savedEntries = new Set(bufferedDiffs);
			this.buffer = this.buffer.filter(q => !savedEntries.has(q));
		};

		const groups = removeDuplicates(buffer.map(log => log.group));

		await Promise.all(
			groups.map(group =>
				Promise.all([
					this.claimCurrentLog(group, 'hour'),
					this.claimCurrentLog(group, 'day'),
				]).then(([logHour, logDay]) =>
					update(logHour, logDay))));
	}

	@bindThis
	public async tick(major: boolean, group: string | null = null): Promise<void> {
		const data = major ? await this.tickMajor(group) : await this.tickMinor(group);

		const columns = {} as Record<keyof Columns<T>, number>;
		for (const [k, v] of Object.entries(data) as ([keyof typeof data, number])[]) {
			const name = COLUMN_PREFIX + (k as string).replaceAll('.', COLUMN_DELIMITER) as keyof Columns<T>;
			columns[name] = v;
		}

		if (Object.keys(columns).length === 0) {
			return;
		}

		const update = async (logHour: RawRecord<T>, logDay: RawRecord<T>): Promise<void> => {
			await Promise.all([
				this.updateLogById('hour', logHour.id, columns),
				this.updateLogById('day', logDay.id, columns),
			]);
		};

		return Promise.all([
			this.claimCurrentLog(group, 'hour'),
			this.claimCurrentLog(group, 'day'),
		]).then(([logHour, logDay]) =>
			update(logHour, logDay));
	}

	@bindThis
	public resync(group: string | null = null): Promise<void> {
		return this.tick(true, group);
	}

	@bindThis
	public async clean(): Promise<void> {
		const current = dateUTC(Chart.getCurrentDate());

		// 一日以上前かつ三日以内
		const gt = Chart.dateToTimestamp(current) - (60 * 60 * 24 * 3);
		const lt = Chart.dateToTimestamp(current) - (60 * 60 * 24);

		const columns = {} as Record<keyof TempColumnsForUnique<T>, []>;
		for (const [k, v] of Object.entries(this.schema)) {
			if (v.uniqueIncrement) {
				const name = UNIQUE_TEMP_COLUMN_PREFIX + k.replaceAll('.', COLUMN_DELIMITER) as keyof TempColumnsForUnique<T>;
				columns[name] = [];
			}
		}

		if (Object.keys(columns).length === 0) {
			return;
		}

		await Promise.all([
			this.updateLogsByDateRange('hour', gt, lt, columns),
			this.updateLogsByDateRange('day', gt, lt, columns),
		]);
	}

	@bindThis
	public async getChartRaw(span: 'hour' | 'day', amount: number, cursor: Date | null, group: string | null = null): Promise<ChartResult<T>> {
		const [y, m, d, h, _m, _s, _ms] = cursor ? Chart.parseDate(subtractTime(addTime(cursor, 1, span), 1)) : Chart.getCurrentDate();
		const [y2, m2, d2, h2] = cursor ? Chart.parseDate(addTime(cursor, 1, span)) : [] as never;

		const lt = dateUTC([y, m, d, h, _m, _s, _ms]);

		const gt =
			span === 'day' ? subtractTime(cursor ? dateUTC([y2, m2, d2, 0]) : dateUTC([y, m, d, 0]), amount - 1, 'day') :
			span === 'hour' ? subtractTime(cursor ? dateUTC([y2, m2, d2, h2]) : dateUTC([y, m, d, h]), amount - 1, 'hour') :
			new Error('not happen') as never;

		// ログ取得
		let logs = (await this.chartDb.execute(sql`
			SELECT *
			FROM ${identifierSql(this.getTable(span))}
			WHERE "date" BETWEEN ${Chart.dateToTimestamp(gt)} AND ${Chart.dateToTimestamp(lt)}
				${this.groupCondition(group)}
			ORDER BY "date" DESC
		`)).rows as RawRecord<T>[];

		// 要求された範囲にログがひとつもなかったら
		if (logs.length === 0) {
			// もっとも新しいログを持ってくる
			// (すくなくともひとつログが無いと補間できないため)
			const recentLog = await this.getLatestLog(group, span);

			if (recentLog) {
				logs = [recentLog];
			}

		// 要求された範囲の最も古い箇所に位置するログが存在しなかったら
		} else if (!isTimeSame(new Date(logs.at(-1)!.date * 1000), gt)) {
			// 要求された範囲の最も古い箇所時点での最も新しいログを持ってきて末尾に追加する
			// (補間できないため)
			const outdatedLog = (await this.chartDb.execute(sql`
				SELECT *
				FROM ${identifierSql(this.getTable(span))}
				WHERE "date" < ${Chart.dateToTimestamp(gt)}
					${this.groupCondition(group)}
				ORDER BY "date" DESC
				LIMIT 1
			`)).rows[0] as RawRecord<T> | undefined;

			if (outdatedLog) {
				logs.push(outdatedLog);
			}
		}

		const chart: KVs<T>[] = [];

		for (let i = (amount - 1); i >= 0; i--) {
			const current =
				span === 'hour' ? subtractTime(dateUTC([y, m, d, h]), i, 'hour') :
				span === 'day' ? subtractTime(dateUTC([y, m, d]), i, 'day') :
				new Error('not happen') as never;

			const log = logs.find(l => isTimeSame(new Date(l.date * 1000), current));

			if (log) {
				chart.unshift(this.convertRawRecord(log));
			} else {
				// 補間
				const latest = logs.find(l => isTimeBefore(new Date(l.date * 1000), current));
				const data = latest ? this.convertRawRecord(latest) : null;
				chart.unshift(this.getNewLog(data));
			}
		}

		const res = {} as ChartResult<T>;

		/**
		 * [{ foo: 1, bar: 5 }, { foo: 2, bar: 6 }, { foo: 3, bar: 7 }]
		 * を
		 * { foo: [1, 2, 3], bar: [5, 6, 7] }
		 * にする
		 */
		for (const record of chart) {
			for (const [k, v] of Object.entries(record) as ([keyof typeof record, number])[]) {
				if (res[k]) {
					res[k].push(v);
				} else {
					res[k] = [v];
				}
			}
		}

		return res;
	}

	@bindThis
	public async getChart(span: 'hour' | 'day', amount: number, cursor: Date | null, group: string | null = null): Promise<Unflatten<ChartResult<T>>> {
		const result = await this.getChartRaw(span, amount, cursor, group);
		const object: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(result)) {
			const keys = k.split('.');
			let cursor = object;
			for (const key of keys.slice(0, -1)) {
				cursor = (cursor[key] ??= {}) as Record<string, unknown>;
			}
			cursor[keys.at(-1)!] = v;
		}
		return object as Unflatten<ChartResult<T>>;
	}
}
