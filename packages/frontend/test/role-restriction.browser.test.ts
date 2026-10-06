/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { useRoleRestriction } from '@/composables/useRoleRestriction.js';

const { misskeyApi } = vi.hoisted(() => ({ misskeyApi: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi }));
vi.mock('@/os.js', () => ({
	select: vi.fn(() => {
		throw new Error('Unexpected role picker');
	}),
}));

describe('useRoleRestriction', () => {
	test('ロールの一覧を取得できなくても、保存する制限は元の ID のまま', async () => {
		const request = Promise.reject(new TypeError('Failed to fetch'));
		misskeyApi.mockReturnValueOnce(request);

		const { roleIds, entries } = useRoleRestriction(['role-a', 'role-b']);
		await expect(request).rejects.toThrow('Failed to fetch');
		await nextTick();

		expect(roleIds.value).toEqual(['role-a', 'role-b']);
		expect(entries.value).toEqual([
			{ id: 'role-a', role: null },
			{ id: 'role-b', role: null },
		]);
	});

	test('取得できた一覧に無い ID (削除済みのロール) だけを外す', async () => {
		const request = Promise.resolve([{ id: 'role-a', name: 'A' }]);
		misskeyApi.mockReturnValueOnce(request);

		const { roleIds, entries } = useRoleRestriction(['role-a', 'role-deleted']);
		await request;
		await nextTick();

		expect(roleIds.value).toEqual(['role-a']);
		expect(entries.value.map((entry) => entry.role?.name)).toEqual(['A']);
	});
});
