/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isJsonObject, miLocalStorage } from '@/local-storage.js';

/**
 * 端末全体に残す下書きの件数。アカウント・返信先・引用元・チャンネルごとに別の鍵で残り、投稿せずに
 * 閉じた分は消えないので、上限が無いと増え続ける。保存は入力のたびに全件を読み書きするため、件数がそのまま
 * 1 打鍵の費用になり、localStorage の容量の上限を超えると以後の保存が例外で失敗する。
 */
export const MAX_LOCAL_DRAFTS = 50;

export type LocalDraftScope = {
	accountId: string;
	channelId?: string | undefined;
	replyId?: string | undefined;
	renoteId?: string | undefined;
};

function keyOf(scope: LocalDraftScope): string {
	const channel = scope.channelId ? `channel:${scope.channelId}` : '';
	if (scope.renoteId) return `${channel}renote:${scope.renoteId}:${scope.accountId}`;
	if (scope.replyId) return `${channel}reply:${scope.replyId}:${scope.accountId}`;
	return `${channel}note:${scope.accountId}`;
}

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

export function readLocalDraft(scope: LocalDraftScope): unknown {
	return readAll()[keyOf(scope)];
}

/** 中身の無い下書きは残さない (復元しても何も戻らず、確認だけが出る)。 */
export function writeLocalDraft(scope: LocalDraftScope, draft: { updatedAt: string }, hasContent: boolean): void {
	const key = keyOf(scope);
	const drafts = readAll();
	if (hasContent) {
		drafts[key] = draft;
	} else {
		if (!(key in drafts)) return;
		delete drafts[key];
	}
	miLocalStorage.setItemAsJson('drafts', pruneLocalDrafts(drafts));
}

export function deleteLocalDraft(scope: LocalDraftScope): void {
	writeLocalDraft(scope, { updatedAt: '' }, false);
}
