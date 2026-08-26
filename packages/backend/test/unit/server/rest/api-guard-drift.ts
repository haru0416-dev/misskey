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
 * ルート登録が meta の宣言どおりに検査しているかをソースから照合する。
 * endpointHandler 経由の登録は withEndpointGuards が meta から検査を組み立てるので
 * ずれようがないが、手書きのままにした登録 (URL クエリを読む GET、multipart、
 * 認証前の特殊経路など) は宣言と実装が独立に動くため、この検査が唯一の歯止めになる。
 */

const GUARD_CALL =
	/\b(assertCredential|assertSecureCredential|assertTokenPermission|assertProhibitMoved|hasHonoApiRolePolicyOrIsRoot|assertHonoApiAdmin|isHonoApiAdministrator|assertHonoApiModerator|assertHonoApiRateLimitForUser)\b/g;

const routesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../src/server/rest/routes');

type Registration = {
	file: string;
	path: string;
	body: string;
	helper: 'endpointHandler' | 'endpointHandlerAnonymous' | null;
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
				if (char === '\\') escaped = true;
				else if (char === quote) quote = null;
			} else if (char === '"' || char === "'" || char === '`') {
				quote = char;
			} else if (char === '(') {
				depth++;
			} else if (char === ')') {
				depth--;
				if (depth === 0) break;
			}
		}

		const body = source.slice(match.index, end + 1);
		const path = body.match(/['"](\/[^'"]*)['"]/)?.[1];
		if (path != null) {
			found.push({
				file,
				path,
				body,
				helper: body.includes('endpointHandlerAnonymous(deps')
					? 'endpointHandlerAnonymous'
					: body.includes('endpointHandler(deps')
						? 'endpointHandler'
						: null,
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
	if (!Object.hasOwn(endpointMetas, name)) return null;
	return endpointMetas[name as keyof typeof endpointMetas].meta as GuardMeta;
}

function requiresCredential(meta: GuardMeta): boolean {
	return meta.requireCredential === true || meta.requireModerator === true || meta.requireAdmin === true;
}

/** withEndpointGuards が meta から掛ける検査を、手書きルートで許容される呼び出し名の集合として表す。 */
function expectedGuards(meta: GuardMeta): { label: string; accepts: string[] }[] {
	const expected: { label: string; accepts: string[] }[] = [];

	if (requiresCredential(meta)) expected.push({ label: 'requireCredential', accepts: ['assertCredential'] });
	if (meta.secure === true) expected.push({ label: 'secure', accepts: ['assertSecureCredential'] });
	if (meta.kind != null && meta.kind !== 'server') expected.push({ label: 'kind', accepts: ['assertTokenPermission'] });
	if (meta.prohibitMoved === true) expected.push({ label: 'prohibitMoved', accepts: ['assertProhibitMoved'] });
	if (meta.requireRolePolicy != null) {
		expected.push({ label: 'requireRolePolicy', accepts: ['hasHonoApiRolePolicyOrIsRoot'] });
	}
	if (meta.requireAdmin === true) {
		expected.push({ label: 'requireAdmin', accepts: ['assertHonoApiAdmin', 'isHonoApiAdministrator'] });
	} else if (meta.requireModerator === true) {
		expected.push({ label: 'requireModerator', accepts: ['assertHonoApiModerator', 'isHonoApiModerator'] });
	}
	// 未認証でも通るエンドポイントの制限は IP 単位で、meta からは適用されない。
	if (meta.limit != null && requiresCredential(meta)) {
		expected.push({ label: 'limit', accepts: ['assertHonoApiRateLimitForUser', 'assertHonoApiRateLimit'] });
	}

	return expected;
}

describe('API guard drift', () => {
	const registrations = readRegistrations();

	test('ルート登録をソースから抽出できている', () => {
		expect(registrations.length).toBeGreaterThan(400);
	});

	test('endpointHandler と endpointHandlerAnonymous の使い分けが meta と一致する', () => {
		const errors: string[] = [];

		for (const registration of registrations) {
			if (registration.helper == null) continue;
			const name = registration.path.slice(1);
			const meta = guardMetaOf(name);
			if (meta == null) {
				errors.push(`${registration.file}: ${name} にメタ情報が無い`);
				continue;
			}

			const expectedHelper = requiresCredential(meta) ? 'endpointHandler' : 'endpointHandlerAnonymous';
			if (registration.helper !== expectedHelper) {
				errors.push(
					`${registration.file}: ${name} は ${expectedHelper} を使うべきだが ${registration.helper} を使っている`,
				);
			}
		}

		expect(errors).toStrictEqual([]);
	});

	test('手書きルートが meta にない検査を足していない', () => {
		const errors: string[] = [];

		for (const registration of registrations) {
			if (registration.helper != null) continue;
			const name = registration.path.slice(1);
			const meta = guardMetaOf(name);
			if (meta == null) continue;

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
			if (registration.helper != null) continue;
			const name = registration.path.slice(1);
			const meta = guardMetaOf(name);
			if (meta == null) continue; // メタ情報を持たない経路 (signup-flow 等) は契約テストの管轄。

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
