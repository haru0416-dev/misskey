/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
// テスト本体で import すると、@/os.js 以下の読み込みが 5 秒の制限に含まれ、負荷次第で落ちる。
// vi.mock は import より先に実行されるので、ここで読み込んでもモックが効く。
import { useRoleRestriction } from '@/composables/useRoleRestriction.js';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => nextTick());

const { misskeyApi } = vi.hoisted(() => ({ misskeyApi: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi }));

describe('useRoleRestriction', () => {
	test('ロールの一覧を取得できなくても、保存する制限は元の ID のまま', async () => {
		misskeyApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		const { roleIds, entries } = useRoleRestriction(['role-a', 'role-b']);
		await flushPromises();

		expect(roleIds.value).toEqual(['role-a', 'role-b']);
		expect(entries.value).toEqual([
			{ id: 'role-a', role: null },
			{ id: 'role-b', role: null },
		]);
	});

	test('取得できた一覧に無い ID (削除済みのロール) だけを外す', async () => {
		misskeyApi.mockResolvedValueOnce([{ id: 'role-a', name: 'A' }]);

		const { roleIds, entries } = useRoleRestriction(['role-a', 'role-deleted']);
		await flushPromises();

		expect(roleIds.value).toEqual(['role-a']);
		expect(entries.value.map((entry) => entry.role?.name)).toEqual(['A']);
	});
});
