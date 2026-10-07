/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isJsonObject, miLocalStorage } from '@/local-storage.js';

/**
 * 端末全体に残す下書きの件数。アカウント・返信先・引用元・チャンネルごとに独立した鍵で保存し、
 * 閉じる直前の入力も同期で確定する。件数制限は保存済みの下書きだけに適用する。
 */
export const MAX_LOCAL_DRAFTS = 50;

export type LocalDraftScope = {
	accountId: string;
	channelId?: string | undefined;
	replyId?: string | undefined;
	renoteId?: string | undefined;
};

const PREFIX = 'miux:local-draft:';

type StoredDraftVersion = {
	scope: string;
	stamp: number;
	draft: Record<string, unknown> | null;
};

type DraftVersion = StoredDraftVersion & { key: `miux:${string}` };

function scopeOf(scope: LocalDraftScope): string {
	return JSON.stringify([
		scope.accountId,
		scope.channelId ?? null,
		scope.renoteId ? 'renote' : scope.replyId ? 'reply' : 'note',
		scope.renoteId ?? scope.replyId ?? null,
	]);
}

function isStoredDraftVersion(value: unknown): value is StoredDraftVersion {
	return (
		isJsonObject(value) &&
		typeof value['scope'] === 'string' &&
		typeof value['stamp'] === 'number' &&
		Number.isSafeInteger(value['stamp']) &&
		value['stamp'] >= 0 &&
		(value['draft'] === null || isJsonObject(value['draft']))
	);
}

function readVersions(): DraftVersion[] {
	const versions: DraftVersion[] = [];
	const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(PREFIX));
	for (const key of keys) {
		const storageKey = key as `miux:${string}`;
		const version = miLocalStorage.getItemAsJson(storageKey, isStoredDraftVersion);
		if (version) versions.push({ ...version, key: storageKey });
	}
	return versions;
}

function latestVersions(versions: DraftVersion[]): Map<string, DraftVersion> {
	const latest = new Map<string, DraftVersion>();
	for (const version of versions) {
		const previous = latest.get(version.scope);
		if (
			!previous ||
			version.stamp > previous.stamp ||
			(version.stamp === previous.stamp && version.key > previous.key)
		) {
			latest.set(version.scope, version);
		}
	}
	return latest;
}

function latestVersion(scope: string, versions: DraftVersion[]): DraftVersion | undefined {
	let latest: DraftVersion | undefined;
	for (const version of versions) {
		if (
			version.scope === scope &&
			(!latest || version.stamp > latest.stamp || (version.stamp === latest.stamp && version.key > latest.key))
		) {
			latest = version;
		}
	}
	return latest;
}

function pruneVersions(): void {
	const versions = readVersions();
	const latest = latestVersions(versions);
	const drafts: Record<string, unknown> = {};
	for (const [scope, version] of latest) {
		if (version.draft !== null) drafts[scope] = version.draft;
	}
	const kept = pruneLocalDrafts(drafts);
	for (const version of versions) {
		const current = latest.get(version.scope)!;
		if (version.key !== current.key || (current.draft !== null && !(version.scope in kept))) {
			miLocalStorage.removeItem(version.key);
		}
	}
}

let pendingPrune: Promise<void> | null = null;

function schedulePrune(): void {
	if (typeof navigator === 'undefined' || navigator.locks == null) {
		pruneVersions();
		return;
	}
	if (pendingPrune) return;
	pendingPrune = navigator.locks.request('misskey:local-draft-pruning', pruneVersions).finally(() => {
		pendingPrune = null;
	});
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
	return latestVersion(scopeOf(scope), readVersions())?.draft ?? undefined;
}

/**
 * 同期で独立した不変の版を追加する。削除も版として残すので、整理前の古い版から復活しない。
 * 同じ stamp で競合する同一投稿先の編集は版の鍵の辞書順で決まり、異なる投稿先は互いを上書きしない。
 * 整理は snapshot に含まれる版だけを消すため、その後に追加された版を古い判断で消さない。
 */
export function writeLocalDraft(scope: LocalDraftScope, draft: { updatedAt: string }, hasContent: boolean): void {
	const scopeKey = scopeOf(scope);
	const previous = latestVersion(scopeKey, readVersions());
	if (!hasContent && (!previous || previous.draft === null)) return;
	const version: StoredDraftVersion = {
		scope: scopeKey,
		stamp: Math.max(Date.now(), (previous?.stamp ?? 0) + 1),
		draft: hasContent ? draft : null,
	};
	// HTTP オリジンでも保存できるよう、secure context 限定の randomUUID は使わず 128 bit の乱数を使う。
	const random = crypto.getRandomValues(new Uint32Array(4));
	let versionId = '';
	for (const word of random) versionId += word.toString(16).padStart(8, '0');
	miLocalStorage.setItemAsJson(`${PREFIX}${versionId}`, version);
	schedulePrune();
}

export function deleteLocalDraft(scope: LocalDraftScope): void {
	writeLocalDraft(scope, { updatedAt: '' }, false);
}
