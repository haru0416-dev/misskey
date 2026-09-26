/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { endpointMetas } from '@/server/api/endpoint-metas.js';

/*
 * 手書きのルート登録が meta の宣言どおりに検査しているかをソースから照合する。
 * 契約から登録するエンドポイントは registerEndpoints が meta から検査を組み立てるのでずれようがないが、
 * 手書きのまま残した登録 (multipart、認証前の特殊経路など) は宣言と実装が独立に動くため、
 * この検査が唯一の歯止めになる。
 */

const GUARD_CALL =
	/\b(assertCredential|assertSecureCredential|assertTokenPermission|assertProhibitMoved|hasApiRolePolicyOrIsRoot|assertApiAdmin|isApiAdministrator|assertApiModerator|assertApiRateLimitForUser)\b/g;

const routesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../src/server/rest/routes');
const endpointsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../src/server/rest/endpoints');

type Registration = {
	file: string;
	path: string;
	body: string;
};

/** `app.get(` 等の呼び出しを括弧の対応で切り出す (文字列リテラル内の括弧は数えない)。 */
function extractRegistrations(source: string, file: string): Registration[] {
	const found: Registration[] = [];
	const call = /app\.(?:get|post|on)\(/g;
	let match: RegExpExecArray | null;

	while ((match = call.exec(source)) !== null) {
		const open = match.index + match[0].length - 1;
		let depth = 0;
		let quote: string | null = null;
		let escaped = false;
		let end = open;

		for (; end < source.length; end++) {
			const char = source[end];
			if (escaped) {
				escaped = false;
			} else if (quote != null) {
				if (char === '\\') {
					escaped = true;
				} else if (char === quote) {
					quote = null;
				}
			} else if (char === '"' || char === "'" || char === '`') {
				quote = char;
			} else if (char === '(') {
				depth++;
			} else if (char === ')') {
				depth--;
				if (depth === 0) {
					break;
				}
			}
		}

		const body = source.slice(match.index, end + 1);
		const path = body.match(/['"](\/[^'"]*)['"]/)?.[1];
		if (path != null) {
			found.push({
				file,
				path,
				body,
			});
		}
		call.lastIndex = end;
	}

	return found;
}

function readRegistrations(): Registration[] {
	return readdirSync(routesDir)
		.filter((name) => name.endsWith('.ts'))
		.flatMap((name) => extractRegistrations(readFileSync(join(routesDir, name), 'utf8'), name));
}

type GuardMeta = {
	requireCredential?: boolean;
	requireModerator?: boolean;
	requireAdmin?: boolean;
	secure?: boolean;
	prohibitMoved?: boolean;
	requireRolePolicy?: string;
	kind?: string;
	limit?: unknown;
};

function guardMetaOf(name: string): GuardMeta | null {
	if (!Object.hasOwn(endpointMetas, name)) {
		return null;
	}
	return endpointMetas[name as keyof typeof endpointMetas].meta as GuardMeta;
}

function requiresCredential(meta: GuardMeta): boolean {
	return meta.requireCredential === true || meta.requireModerator === true || meta.requireAdmin === true;
}

/** applyEndpointGuards が meta から掛ける検査を、手書きルートで許容される呼び出し名の集合として表す。 */
function expectedGuards(meta: GuardMeta): { label: string; accepts: string[] }[] {
	const expected: { label: string; accepts: string[] }[] = [];

	if (requiresCredential(meta)) {
		expected.push({ label: 'requireCredential', accepts: ['assertCredential'] });
	}
	if (meta.secure === true) {
		expected.push({ label: 'secure', accepts: ['assertSecureCredential'] });
	}
	if (meta.kind != null && meta.kind !== 'server') {
		expected.push({ label: 'kind', accepts: ['assertTokenPermission'] });
	}
	if (meta.prohibitMoved === true) {
		expected.push({ label: 'prohibitMoved', accepts: ['assertProhibitMoved'] });
	}
	if (meta.requireRolePolicy != null) {
		expected.push({ label: 'requireRolePolicy', accepts: ['hasApiRolePolicyOrIsRoot'] });
	}
	if (meta.requireAdmin === true) {
		expected.push({ label: 'requireAdmin', accepts: ['assertApiAdmin', 'isApiAdministrator'] });
	} else if (meta.requireModerator === true) {
		expected.push({ label: 'requireModerator', accepts: ['assertApiModerator', 'isApiModerator'] });
	}
	// 未認証でも通るエンドポイントの制限は IP 単位で、meta からは適用されない。
	if (meta.limit != null && requiresCredential(meta)) {
		expected.push({ label: 'limit', accepts: ['assertApiRateLimitForUser', 'assertApiRateLimit'] });
	}

	return expected;
}

describe('API guard drift', () => {
	const registrations = readRegistrations();

	test('ルート登録をソースから抽出できている', () => {
		// 契約から登録するエンドポイントは routes/ に現れない。手書きで残る代表的な登録を拾えているかだけを見る。
		const paths = registrations.map((registration) => registration.path);
		expect(paths).toContain('/drive/files/create');
		expect(paths).toContain('/signin-flow');
	});

	test('契約の実装が meta の回数制限を数え直していない', () => {
		// 共通 guard は meta.limit を同じキー (エンドポイント名) で数える。実装で同じ枠をもう一度数えると、
		// 1 回目の記録が 2 回目の判定に入り、本番では毎回 429 になる。
		// meta が間隔 (minInterval) だけを宣言し、件数の上限を処理の途中で数えるのは許す。
		const errors: string[] = [];
		for (const name of readdirSync(endpointsDir).filter((file) => file.endsWith('.ts'))) {
			const source = readFileSync(join(endpointsDir, name), 'utf8');
			for (const match of source.matchAll(/assertApiRateLimitForUser\(\s*deps,\s*'([^']+)'/g)) {
				const endpoint = match[1]!;
				const limit = guardMetaOf(endpoint)?.limit as { duration?: number; max?: number } | undefined;
				if (limit?.duration != null || limit?.max != null) {
					errors.push(`${name}: ${endpoint} は meta の limit と同じ枠を実装でも数えている`);
				}
			}
		}
		expect(errors).toStrictEqual([]);
	});

	test('手書きルートが meta にない検査を足していない', () => {
		const errors: string[] = [];

		for (const registration of registrations) {
			const name = registration.path.slice(1);
			const meta = guardMetaOf(name);
			if (meta == null) {
				continue;
			}

			const declared = new Set(expectedGuards(meta).flatMap((guard) => guard.accepts));
			for (const match of registration.body.matchAll(GUARD_CALL)) {
				const called = match[1];
				if (called != null && !declared.has(called)) {
					errors.push(`${registration.file}: ${name} は ${called} を呼んでいるが meta に対応する宣言が無い`);
				}
			}
		}

		expect(errors).toStrictEqual([]);
	});

	test('手書きルートが meta の宣言どおりに検査している', () => {
		const errors: string[] = [];

		for (const registration of registrations) {
			const name = registration.path.slice(1);
			const meta = guardMetaOf(name);
			if (meta == null) {
				continue;
			} // メタ情報を持たない経路 (signup-flow 等) は契約テストの管轄。

			for (const guard of expectedGuards(meta)) {
				if (!guard.accepts.some((fn) => new RegExp(`\\b${fn}\\b`).test(registration.body))) {
					errors.push(
						`${registration.file}: ${name} は ${guard.label} を宣言しているが ${guard.accepts.join(' / ')} を呼んでいない`,
					);
				}
			}
		}

		expect(errors).toStrictEqual([]);
	});
});
