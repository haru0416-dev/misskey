/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type ActionRecord = {
	name: string;
	args: unknown[];
};

type Listener = (record: ActionRecord) => void;

const listeners = new Set<Listener>();

/**
 * story が component へ渡すイベントハンドラを作る。呼ばれた内容はカタログの一覧へ流す。
 * 購読者が居ない場面 (テスト実行時など) では何も起きない。
 */
export function action(name: string): (...args: unknown[]) => void {
	return (...args: unknown[]) => {
		for (const listener of listeners) {
			listener({ name, args });
		}
	};
}

export function onAction(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
