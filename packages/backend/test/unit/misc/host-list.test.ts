/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	denyListLikePatterns,
	isHostInAllowList,
	isHostInDenyList,
	isHostInExactDenyList,
	normalizeHostListEntry,
} from '@/misc/host-list.js';

describe('misc:host-list', () => {
	test('拒否側はホスト名と下位ドメインで照合し、ポートに関係なく該当する', () => {
		const list = ['evil.example'];
		expect(isHostInDenyList(list, 'evil.example')).toBe(true);
		expect(isHostInDenyList(list, 'evil.example:8443')).toBe(true);
		expect(isHostInDenyList(list, 'sub.evil.example:8443')).toBe(true);
		expect(isHostInDenyList(list, 'notevil.example:8443')).toBe(false);
		expect(isHostInDenyList(list, 'evil.example.test')).toBe(false);
		expect(isHostInDenyList(list, null)).toBe(false);
		expect(isHostInDenyList(undefined, 'evil.example')).toBe(false);
	});

	test('拒否側の項目に書かれたポートは無視し、そのホスト名の全ポートを対象にする', () => {
		expect(isHostInDenyList(['evil.example:8443'], 'evil.example:9443')).toBe(true);
		expect(isHostInDenyList(['evil.example:8443'], 'evil.example')).toBe(true);
	});

	test('項目は大小・IDN を正規化して読む', () => {
		expect(isHostInDenyList(['Evil.Example'], 'evil.example:8443')).toBe(true);
		expect(isHostInDenyList(['日本語.jp'], 'xn--wgv71a119e.jp:443')).toBe(true);
	});

	test('完全一致の拒否側は下位ドメインを含めず、ポートは見ない', () => {
		const list = ['media.example'];
		expect(isHostInExactDenyList(list, 'media.example:8443')).toBe(true);
		expect(isHostInExactDenyList(list, 'sub.media.example')).toBe(false);
	});

	test('許可側はポートの無い項目ならホスト名で、ポートのある項目ならポートまで照合する', () => {
		expect(isHostInAllowList(['friend.example'], 'friend.example:8443')).toBe(true);
		expect(isHostInAllowList(['friend.example'], 'sub.friend.example')).toBe(true);
		expect(isHostInAllowList(['friend.example:8443'], 'friend.example:8443')).toBe(true);
		expect(isHostInAllowList(['friend.example:8443'], 'friend.example:9443')).toBe(false);
		expect(isHostInAllowList(['friend.example:8443'], 'friend.example')).toBe(false);
		expect(isHostInAllowList(['friend.example'], 'stranger.example:8443')).toBe(false);
	});

	test('項目は URL ならホスト部分を取り、ホストとして読めなければ null にする', () => {
		expect(normalizeHostListEntry(' https://Evil.Example:8443/users/x ')).toBe('evil.example:8443');
		expect(normalizeHostListEntry('Evil.Example')).toBe('evil.example');
		expect(normalizeHostListEntry('a b.example')).toBeNull();
		expect(normalizeHostListEntry('https://')).toBeNull();
		expect(normalizeHostListEntry(' ')).toBeNull();
	});

	test('読めない項目は照合から除き、URL の形の項目はホストとして照合する', () => {
		expect(denyListLikePatterns(['https://', ' ', 'a b.example'])).toEqual([]);
		expect(isHostInDenyList(['https://evil.example/users/x'], 'evil.example:8443')).toBe(true);
	});

	test('SQL のパターンはポート付きのホストにも一致し、LIKE の記号はそのまま照合する', () => {
		expect(denyListLikePatterns(['evil_host.example:8443'])).toEqual([
			'evil\\_host.example',
			'%.evil\\_host.example',
			'evil\\_host.example:%',
			'%.evil\\_host.example:%',
		]);
	});
});
