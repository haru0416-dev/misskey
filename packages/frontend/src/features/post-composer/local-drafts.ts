/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isJsonObject, miLocalStorage } from '@/local-storage.js';

/**
 * 端末に残す下書きの件数。下書きは返信先・引用元・チャンネルごとに別の鍵で残り、投稿せずに閉じた分は
 * 消えないので、上限が無いと増え続ける。保存は入力のたびに全件を読み書きするため、件数がそのまま
 * 1 打鍵の費用になり、localStorage の容量の上限を超えると以後の保存が例外で失敗していた。
 */
export const MAX_LOCAL_DRAFTS = 50;

function readAll(): Record<string, unknown> {
	return miLocalStorage.getItemAsJson('drafts', isJsonObject) ?? {};
}

function updatedAtOf(draft: unknown): number {
	const updatedAt = isJsonObject(draft) ? draft['updatedAt'] : undefined;
	if (typeof updatedAt !== 'string') return -Infinity;
	const time = Date.parse(updatedAt);
	return Number.isNaN(time) ? -Infinity : time;
}

/** 更新の新しい順に max 件だけ残す。 */
export function pruneLocalDrafts(drafts: Record<string, unknown>, max = MAX_LOCAL_DRAFTS): Record<string, unknown> {
	const keys = Object.keys(drafts);
	if (keys.length <= max) return drafts;
	const kept = keys.sort((a, b) => updatedAtOf(drafts[b]) - updatedAtOf(drafts[a])).slice(0, max);
	return Object.fromEntries(kept.map((key) => [key, drafts[key]]));
}

export function readLocalDraft(key: string): unknown {
	return readAll()[key];
}

/** 中身の無い下書きは残さない (復元しても何も戻らず、確認だけが出る)。 */
export function writeLocalDraft(key: string, draft: { updatedAt: string }, hasContent: boolean): void {
	const drafts = readAll();
	if (hasContent) {
		drafts[key] = draft;
	} else {
		if (!(key in drafts)) return;
		delete drafts[key];
	}
	miLocalStorage.setItemAsJson('drafts', pruneLocalDrafts(drafts));
}

export function deleteLocalDraft(key: string): void {
	writeLocalDraft(key, { updatedAt: '' }, false);
}
