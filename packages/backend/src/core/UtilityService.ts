/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL, domainToASCII } from 'node:url';
import semver from 'semver';
import type { Config } from '@/config.js';
import { MiMeta, SoftwareSuspension } from '@/models/Meta.js';
import { MiInstance } from '@/models/Instance.js';
import RE2 from '@/misc/re2.js';

// ワードミュート等のキーワード判定はノート×ユーザー分呼ばれるホットパスで、正規表現文字列は
// 高々ユーザーが設定したミュートパターンの種類分しか存在しないため、パターン+フラグをキーに
// コンパイル済み RE2 インスタンスを使い回す。上限付きMapで無制限な増加を防ぐ。
const MAX_RE2_CACHE_SIZE = 2000;
const re2Cache = new Map<string, RE2>();

function getCachedRE2(pattern: string, flags: string): RE2 {
	const key = `${flags}\0${pattern}`;
	const cached = re2Cache.get(key);
	if (cached) return cached;

	const regexp = new RE2(pattern, flags);

	if (re2Cache.size >= MAX_RE2_CACHE_SIZE) {
		const oldestKey = re2Cache.keys().next().value;
		if (oldestKey !== undefined) re2Cache.delete(oldestKey);
	}
	re2Cache.set(key, regexp);

	return regexp;
}

export function createUtilityService(config: Config, meta: MiMeta) {
	function getFullApAccount(username: string, host: string | null): string {
		return host ? `${username}@${toPuny(host)}` : `${username}@${toPuny(config.runtime.host)}`;
	}

	function isSelfHost(host: string | null): boolean {
		if (host == null) return true;
		return toPuny(config.runtime.host) === toPuny(host);
	}

	function isUriLocal(uri: string): boolean {
		return punyHost(uri) === toPuny(config.runtime.host);
	}

	// メールアドレスのバリデーションを行う
	// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
	function validateEmailFormat(email: string): boolean {
		const regexp = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		return regexp.test(email);
	}

	function isBlockedHost(blockedHosts: string[], host: string | null): boolean {
		if (host == null) return false;
		return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	function isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	function isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.includes(host.toLowerCase());
	}

	function concatNoteContentsForKeyWordCheck(content: {
		cw?: string | null;
		text?: string | null;
		pollChoices?: string[] | null;
		others?: string[] | null;
	}): string {
		/**
		 * ノートの内容を結合してキーワードチェック用の文字列を生成する
		 * cwとtextは内容が繋がっているかもしれないので間に何も入れずにチェックする
		 */
		return `${content.cw ?? ''}${content.text ?? ''}\n${(content.pollChoices ?? []).join('\n')}\n${(content.others ?? []).join('\n')}`;
	}

	function isKeyWordIncluded(text: string, keyWords: string[]): boolean {
		if (keyWords.length === 0) return false;
		if (text === '') return false;

		const regexpregexp = /^\/(.+)\/(.*)$/;

		const matched = keyWords.some(filter => {
			// represents RegExp
			const regexp = filter.match(regexpregexp);
			// This should never happen due to input sanitisation.
			if (!regexp) {
				const words = filter.split(' ');
				return words.every(keyword => text.includes(keyword));
			}
			try {
				const [, pattern, flags] = regexp;
				if (pattern == null || flags == null) return false;
				return getCachedRE2(pattern, flags).test(text);
			} catch (_) {
				// This should never happen due to input sanitisation.
				return false;
			}
		});

		return matched;
	}

	function extractDbHost(uri: string): string {
		const url = new URL(uri);
		return toPuny(url.host);
	}

	function toPuny(host: string): string {
		return domainToASCII(host.toLowerCase());
	}

	function toPunyNullable(host: string | null | undefined): string | null {
		if (host == null) return null;
		return domainToASCII(host.toLowerCase());
	}

	function punyHost(url: string): string {
		const urlObj = new URL(url);
		const host = `${toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	function isFederationAllowedHost(host: string): boolean {
		if (isSelfHost(host)) return true;
		if (meta.federation === 'none') return false;
		if (meta.federation === 'specified' && !meta.federationHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`))) return false;
		if (isBlockedHost(meta.blockedHosts, host)) return false;

		return true;
	}

	function isFederationAllowedUri(uri: string): boolean {
		const host = extractDbHost(uri);
		return isFederationAllowedHost(host);
	}

	function isDeliverSuspendedSoftware(software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>): SoftwareSuspension | undefined {
		if (software.softwareName == null) return undefined;
		if (software.softwareVersion == null) {
			// software version is null; suspend iff versionRange is *
			return meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& x.versionRange.trim() === '*');
		} else {
			const softwareVersion = software.softwareVersion;
			return meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& semver.satisfies(softwareVersion, x.versionRange, { includePrerelease: true }));
		}
	}

	return {
		getFullApAccount,
		isSelfHost,
		isUriLocal,
		validateEmailFormat,
		isBlockedHost,
		isSilencedHost,
		isMediaSilencedHost,
		concatNoteContentsForKeyWordCheck,
		isKeyWordIncluded,
		extractDbHost,
		toPuny,
		toPunyNullable,
		punyHost,
		isFederationAllowedHost,
		isFederationAllowedUri,
		isDeliverSuspendedSoftware,
	};
}

export type UtilityService = ReturnType<typeof createUtilityService>;
