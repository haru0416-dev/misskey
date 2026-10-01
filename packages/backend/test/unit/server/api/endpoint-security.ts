/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { endpointMetas } from '@/server/api/endpoint-metas.js';
import type { EndpointGuardMeta } from '@/server/rest/endpoint-guards.js';

/*
 * meta が宣言する認証・権限・移行済み利用者の拒否・scope を固定し、意図しない API 契約の変更を検出する。
 * この表だけでは実際の拒否を保証できない。共通 guard の拒否条件・順序・エラーは e2e/api.ts 等で確かめる。
 * 宣言を変更する場合は endpoint-security.snap.txt の差分を認可契約の変更としてレビューする。
 */

function describeGuards(meta: EndpointGuardMeta): string {
	const parts: string[] = [];
	if (meta.requireAdmin === true) parts.push('admin');
	else if (meta.requireModerator === true) parts.push('moderator');
	else if (meta.requireCredential === true) parts.push('credential');
	else parts.push('anonymous');
	if (meta.secure === true) parts.push('secure');
	if (meta.prohibitMoved === true) parts.push('prohibit-moved');
	if (meta.requiredRolePolicy != null) parts.push(`policy=${meta.requiredRolePolicy}`);
	if (meta.kind != null) parts.push(`kind=${meta.kind}`);
	return parts.join(' ');
}

const entries = Object.entries(endpointMetas)
	.map(([name, contract]) => [name, contract.meta as EndpointGuardMeta] as const)
	.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

describe('エンドポイントの権限の宣言', () => {
	test('全エンドポイントの宣言が固定した表と一致する', async () => {
		const table = entries.map(([name, meta]) => `${name}: ${describeGuards(meta)}`).join('\n');
		await expect(`${table}\n`).toMatchFileSnapshot('./endpoint-security.snap.txt');
	});

	// 表の更新で見落としやすい、新しい admin エンドポイントの宣言漏れを規則で止める。
	// ロールの判定は管理者・モデレーター・ロールのポリシーのどれか。scope は admin のもの (secure はネイティブの
	// トークン専用なので scope を持たない)。
	test('admin/ のエンドポイントはロールで絞り、admin の scope を要求する', () => {
		// 初期設定で最初の管理者を作るため匿名でも呼べる。root かどうかはハンドラーが判定する (e2e/endpoints-admin.ts)。
		const exceptions = new Set(['admin/accounts/create']);
		const violations = entries
			.filter(([name]) => name.startsWith('admin/') && !exceptions.has(name))
			.filter(
				([, meta]) =>
					!(meta.requireAdmin === true || meta.requireModerator === true || meta.requiredRolePolicy != null) ||
					!(meta.secure === true || /^(read|write):admin:/.test(meta.kind ?? '')),
			)
			.map(([name, meta]) => `${name}: ${describeGuards(meta)}`);
		expect(violations).toEqual([]);
	});
});
