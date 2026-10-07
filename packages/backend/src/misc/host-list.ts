/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { splitHostPort, toPuny } from '@/misc/to-puny.js';

/**
 * 管理者が設定するホストの一覧 (blockedHosts・silencedHosts・mediaSilencedHosts・federationHosts・
 * bannedEmailDomains) との照合。
 *
 * 照合するホストは DB の形 (`toPuny` 済みの `ホスト名[:ポート]`)。一覧の項目は保存時に正規化されて
 * いないものがあるので (大小・IDN・ポート)、`toPuny` を通して読む。
 *
 * - 拒否側 (ブロック・サイレンス) は、ホスト名が項目かその下位ドメインならポートに関係なく該当する。
 *   同じホスト名の別ポートは同じ DNS の持ち主が立てたサーバーで、ポートを変えるだけで回避できては
 *   ならないため。項目にポートが書かれていても、そのホスト名の全ポートを対象にする。
 * - 許可側 (federationHosts) は、ポートを除いたホスト名で照合する。項目にポートが書かれていれば
 *   ポートまで一致したときだけ許可する。ポートの無い項目は、そのホスト名の持ち主を信頼したものと読み、
 *   ポートの書かれた項目は、書かれた範囲より広く許可しない。
 */

type HostListEntry = { hostname: string; port: string | null };

function parseHost(host: string): HostListEntry | null {
	const parts = splitHostPort(host.toLowerCase());
	if (parts == null || parts.hostname === '') {
		return null;
	}
	return parts;
}

// meta の一覧は更新のたびに新しい配列に置き換わる (Object.assign)。配列をその場で書き換えない前提で、
// 配列ごとに正規化した項目を使い回す。タイムラインではノートごと・関係ユーザーごとに照合するため。
const compiledLists = new WeakMap<readonly string[], readonly HostListEntry[]>();

function compileHostList(list: readonly string[]): readonly HostListEntry[] {
	let entries = compiledLists.get(list);
	if (entries == null) {
		entries = list.flatMap((item) => {
			const entry = parseHost(toPuny(item.trim()));
			return entry == null ? [] : [entry];
		});
		compiledLists.set(list, entries);
	}
	return entries;
}

function isSameOrSubdomain(hostname: string, entryHostname: string): boolean {
	return hostname === entryHostname || hostname.endsWith(`.${entryHostname}`);
}

/** 拒否側の一覧 (ブロック・サイレンス) に該当するか。ホスト名と下位ドメインで照合し、ポートは見ない。 */
export function isHostInDenyList(list: readonly string[] | null | undefined, host: string | null | undefined): boolean {
	if (list == null || list.length === 0 || host == null) {
		return false;
	}
	const target = parseHost(host);
	if (target == null) {
		return false;
	}
	return compileHostList(list).some((entry) => isSameOrSubdomain(target.hostname, entry.hostname));
}

/** 下位ドメインを含めない拒否側の一覧 (mediaSilencedHosts) に該当するか。ポートは見ない。 */
export function isHostInExactDenyList(
	list: readonly string[] | null | undefined,
	host: string | null | undefined,
): boolean {
	if (list == null || list.length === 0 || host == null) {
		return false;
	}
	const target = parseHost(host);
	if (target == null) {
		return false;
	}
	return compileHostList(list).some((entry) => target.hostname === entry.hostname);
}

/** 許可側の一覧 (federationHosts) に含まれるか。ポートの書かれた項目はポートまで一致を求める。 */
export function isHostInAllowList(list: readonly string[], host: string): boolean {
	const target = parseHost(host);
	if (target == null) {
		return false;
	}
	return compileHostList(list).some(
		(entry) => isSameOrSubdomain(target.hostname, entry.hostname) && (entry.port == null || entry.port === target.port),
	);
}

/**
 * `isHostInDenyList` と同じ判定を SQL で行うための `ILIKE` パターン。ホスト列が
 * どれかに一致すれば一覧に該当する。
 */
export function denyListLikePatterns(list: readonly string[]): string[] {
	return compileHostList(list).flatMap((entry) => {
		const hostname = sqlLikeEscape(entry.hostname);
		return [hostname, `%.${hostname}`, `${hostname}:%`, `%.${hostname}:%`];
	});
}
