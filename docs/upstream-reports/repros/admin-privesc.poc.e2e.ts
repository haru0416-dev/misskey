/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// PoC: モデレーターが非 root 管理者のパスワードをリセット / MFA 解除できるか (実サーバ e2e)。
process.env.NODE_ENV = 'test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, role, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('PoC #9 moderator -> admin privilege escalation', () => {
	let root: any, admin: any, moderator: any;

	beforeAll(async () => {
		root = await signup({ username: 'root' });       // 最初の signup = インスタンス root/admin
		admin = await signup({ username: 'adminuser' });
		moderator = await signup({ username: 'moduser' });

		const adminRole = await role(root, { isAdministrator: true, name: 'admins' } as Partial<misskey.entities.Role>);
		await api('admin/roles/assign', { userId: admin.id, roleId: adminRole.id }, root);

		const modRole = await role(root, { isModerator: true, name: 'mods' } as Partial<misskey.entities.Role>);
		await api('admin/roles/assign', { userId: moderator.id, roleId: modRole.id }, root);
	}, 1000 * 90);

	test('モデレーターが非 root 管理者のパスワードをリセットできてしまう', async () => {
		const res = await api('admin/reset-password', { userId: admin.id }, moderator);
		// セキュアなら 403 で拒否されるべき。現状は 200 + 払い出しパスワードが返る (= 脆弱)。
		expect({ status: res.status, issuedPassword: (res.body as any)?.password }).toStrictEqual({ status: 403, issuedPassword: undefined });
	});

	test('モデレーターが非 root 管理者の MFA を解除できてしまう', async () => {
		const res = await api('admin/unset-mfa', { userId: admin.id }, moderator);
		// セキュアなら 403 で拒否されるべき。
		expect(res.status).toBe(403);
	});
});
