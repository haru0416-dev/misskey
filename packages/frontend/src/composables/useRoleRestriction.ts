/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

/**
 * 絵文字・アバターデコレーションを使えるロールの制限の編集。保存するのは ID の一覧で、表示用のロールは後から引く。
 * ロールの一覧の取得に失敗しても ID は保ったまま保存できる。取得できたロールだけを保存すると、
 * 取得に失敗したときに制限が空 (全員が使える) で保存されてしまう。
 */
export function useRoleRestriction(initialRoleIds: readonly string[]) {
	const roleIds = ref<string[]>([...initialRoleIds]);
	const roleById = ref<Map<string, Misskey.entities.Role>>(new Map());

	misskeyApi('admin/roles/list')
		.then((roles) => {
			roleById.value = new Map(roles.map((role) => [role.id, role]));
			// 正常に取得できた一覧を正本とし、そこに無い ID だけを制限から外す。
			roleIds.value = roleIds.value.filter((id) => roleById.value.has(id));
		})
		.catch(() => {
			// 取得できなかったロールは ID のまま表示し、制限はそのまま保つ。
		});

	/** 一覧を取得できたロールは詳細を、取得できていないものは ID だけを持つ。 */
	const entries = computed(() => roleIds.value.map((id) => ({ id, role: roleById.value.get(id) ?? null })));

	async function add() {
		const roles = await misskeyApi('admin/roles/list');
		roleById.value = new Map([...roleById.value, ...roles.map((role) => [role.id, role] as const)]);
		const current = new Set(roleIds.value);
		const { canceled, result: roleId } = await os.select({
			items: roles
				.filter((role) => role.isPublic && !current.has(role.id))
				.map((role) => ({ label: role.name, value: role.id })),
		});
		if (canceled || roleId == null) {
			return;
		}
		roleIds.value = [...roleIds.value, roleId];
	}

	function remove(id: string) {
		roleIds.value = roleIds.value.filter((x) => x !== id);
	}

	return { roleIds, entries, add, remove };
}
