/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import { getHonoApiRolePolicies } from '@/server/rest/role-policy.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta, MiRole } from '@/models/_.js';

// policies は jsonb で、role.policies も meta.policies も管理APIから任意の JSON が書き込めてしまう。
// 壊れた値がそのまま制限値として使われないことを確認する
function deps(metaPolicies: Record<string, unknown> = {}) {
	return {
		config: { limits: { maximumFileSizeBytes: 1024 * 1024 * 1024 } } as unknown as Config,
		db: {} as MiDrizzleDatabase,
		meta: { rootUserId: null, policies: metaPolicies } as unknown as MiMeta,
	};
}

function role(policies: Record<string, unknown>): MiRole {
	return { id: 'test', target: 'manual', policies } as unknown as MiRole;
}

describe('getHonoApiRolePolicies', () => {
	test('正しい値のロールポリシーはそのまま採用される', async () => {
		const policies = await getHonoApiRolePolicies(deps(), null, [
			role({
				driveCapacityMb: { useDefault: false, priority: 1, value: 512 },
				canInvite: { useDefault: false, priority: 1, value: true },
				uploadableFileTypes: { useDefault: false, priority: 1, value: ['image/*'] },
				chatAvailability: { useDefault: false, priority: 1, value: 'readonly' },
			}),
		]);

		expect(policies.driveCapacityMb).toBe(512);
		expect(policies.canInvite).toBe(true);
		expect(policies.uploadableFileTypes).toEqual(['image/*']);
		expect(policies.chatAvailability).toBe('readonly');
	});

	test('型の合わない値は既定値へ落とす (Math.max が NaN を返さない)', async () => {
		const policies = await getHonoApiRolePolicies(deps(), null, [
			role({
				driveCapacityMb: { useDefault: false, priority: 1, value: '512' },
				antennaLimit: { useDefault: false, priority: 1, value: null },
				pinLimit: { useDefault: false, priority: 1, value: {} },
				canInvite: { useDefault: false, priority: 1, value: 'true' },
				uploadableFileTypes: { useDefault: false, priority: 1, value: 'image/*' },
			}),
		]);

		expect(policies.driveCapacityMb).toBe(DEFAULT_POLICIES.driveCapacityMb);
		expect(policies.antennaLimit).toBe(DEFAULT_POLICIES.antennaLimit);
		expect(policies.pinLimit).toBe(DEFAULT_POLICIES.pinLimit);
		expect(policies.canInvite).toBe(DEFAULT_POLICIES.canInvite);
		expect(policies.uploadableFileTypes).toEqual(DEFAULT_POLICIES.uploadableFileTypes);
	});

	test('value を持たない / useDefault のポリシーはインスタンス既定値になる', async () => {
		const policies = await getHonoApiRolePolicies(deps({ antennaLimit: 30 }), null, [
			role({
				antennaLimit: { useDefault: true, priority: 1, value: 999 },
				clipLimit: { useDefault: false, priority: 1 },
			}),
		]);

		expect(policies.antennaLimit).toBe(30);
		expect(policies.clipLimit).toBe(DEFAULT_POLICIES.clipLimit);
	});

	test('インスタンス既定値 (meta.policies) が壊れていてもコード側の既定値へ落とす', async () => {
		const brokenMeta = deps({ antennaLimit: 'unlimited', gtlAvailable: 1 });

		const withoutRoles = await getHonoApiRolePolicies(brokenMeta, null, []);
		expect(withoutRoles.antennaLimit).toBe(DEFAULT_POLICIES.antennaLimit);
		expect(withoutRoles.gtlAvailable).toBe(DEFAULT_POLICIES.gtlAvailable);

		// ロールを持つユーザーでも、useDefault のフォールバック先が壊れた値にならない
		const withRole = await getHonoApiRolePolicies(brokenMeta, null, [
			role({ antennaLimit: { useDefault: true, priority: 1 } }),
		]);
		expect(withRole.antennaLimit).toBe(DEFAULT_POLICIES.antennaLimit);
	});

	test('ロールが壊れたポリシーオブジェクトを持っていても例外にならない', async () => {
		const policies = await getHonoApiRolePolicies(deps(), null, [
			role({ antennaLimit: 'broken', driveCapacityMb: null }),
		]);

		expect(policies.antennaLimit).toBe(DEFAULT_POLICIES.antennaLimit);
		expect(policies.driveCapacityMb).toBe(DEFAULT_POLICIES.driveCapacityMb);
	});
});
