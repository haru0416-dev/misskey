/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Ref } from 'vue';
import type { GridColumnSetting } from '@/components/grid/column.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

export type RequestLogItem = {
	failed: boolean;
	url: string;
	name: string;
	error?: string;
};

export const gridSortOrderKeys = [
	'name',
	'category',
	'aliases',
	'type',
	'license',
	'host',
	'uri',
	'publicUrl',
	'isSensitive',
	'localOnly',
	'updatedAt',
] as const satisfies string[];

export type GridSortOrderKey = (typeof gridSortOrderKeys)[number];

export function emptyStrToUndefined(value: string | null) {
	return value ? value : undefined;
}

export function emptyStrToNull(value: string) {
	return value === '' ? null : value;
}

export function emptyStrToEmptyArray(value: string) {
	return value === '' ? [] : value.split(' ').map((it) => it.trim());
}

function roleIdsParser(text: string): { id: string; name: string }[] {
	// idとnameのペア配列をJSONで受け取る。それ以外の形式は許容しない
	try {
		const obj = JSON.parse(text);
		if (!Array.isArray(obj)) {
			return [];
		}
		if (!obj.every((it) => typeof it === 'object' && 'id' in it && 'name' in it)) {
			return [];
		}

		return obj.map((it) => ({ id: it.id, name: it.name }));
	} catch (ex) {
		console.warn(ex);
		return [];
	}
}

type RoleRef = { id: string; name: string };

// 登録・更新画面で共通のロール列。ID の直接入力は扱いづらいため、編集はロール選択モーダルで行う。
export function createRoleColumnSetting(
	gridItems: Ref<{ roleIdsThatCanBeUsedThisEmojiAsReaction: RoleRef[] }[]>,
): GridColumnSetting {
	return {
		bindTo: 'roleIdsThatCanBeUsedThisEmojiAsReaction',
		title: 'role',
		type: 'text',
		editable: true,
		width: 140,
		valueTransformer: (row) => {
			// バックエンドからは ID と名前のペア配列で受け取るが、表示には名前だけを使う。
			return (gridItems.value[row.index]?.roleIdsThatCanBeUsedThisEmojiAsReaction ?? []).map((it) => it.name).join(',');
		},
		customValueEditor: async (row) => {
			const item = gridItems.value[row.index];
			if (item == null) {
				return [];
			}
			const current = item.roleIdsThatCanBeUsedThisEmojiAsReaction;
			const result = await os.selectRole({
				initialRoleIds: current.map((it) => it.id),
				title: i18n.ts.rolesThatCanBeUsedThisEmojiAsReaction,
				infoMessage: i18n.ts.rolesThatCanBeUsedThisEmojiAsReactionEmptyDescription,
				publicOnly: true,
			});
			if (result.canceled) {
				return current;
			}

			const transform = result.result.map((it) => ({ id: it.id, name: it.name }));
			item.roleIdsThatCanBeUsedThisEmojiAsReaction = transform;

			return transform;
		},
		events: {
			paste: roleIdsParser,
			delete(cell) {
				// デフォルトはundefinedになるが、このプロパティは空配列にしたい
				const item = gridItems.value[cell.row.index];
				if (item != null) {
					item.roleIdsThatCanBeUsedThisEmojiAsReaction = [];
				}
			},
		},
	};
}

type EmojiRequestResult<T> = { item: T; success: boolean; err: unknown };

// 1件の失敗で全体を止めないよう、各リクエストの成否を結果として受け取る。
export function settleEmojiRequest<T>(item: T, request: Promise<unknown>): Promise<EmojiRequestResult<T>> {
	return request.then(() => ({ item, success: true, err: undefined })).catch((err) => ({ item, success: false, err }));
}

// 失敗が1件でもあれば通知してから、全件の結果をログ表示用に変換する。
export async function toRequestLogs<T extends { url: string; name: string }>(
	result: EmojiRequestResult<T>[],
): Promise<RequestLogItem[]> {
	const failedItems = result.filter((it) => !it.success);

	if (failedItems.length > 0) {
		await os.alert({
			type: 'error',
			title: i18n.ts.somethingHappened,
			text: i18n.ts._customEmojisManager._gridCommon.alertEmojisRegisterFailedDescription,
		});
	}

	return result.map((it) => ({
		failed: !it.success,
		url: it.item.url,
		name: it.item.name,
		...(it.err ? { error: JSON.stringify(it.err) } : {}),
	}));
}
