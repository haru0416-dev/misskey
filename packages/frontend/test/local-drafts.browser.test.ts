/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { waitFor } from '@testing-library/vue';
import {
	MAX_LOCAL_DRAFTS,
	deleteLocalDraft,
	pruneLocalDrafts,
	readLocalDraft,
	writeLocalDraft,
} from '@/features/post-composer/local-drafts.js';
import type { LocalDraftScope } from '@/features/post-composer/local-drafts.js';

function draft(minute: number, text = 'x') {
	return { updatedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), data: { text } };
}

function stored(): Record<string, unknown> {
	return Object.fromEntries(
		Object.keys(window.localStorage)
			.filter((key) => key.startsWith('miux:local-draft:'))
			.map((key) => [key, JSON.parse(window.localStorage.getItem(key) ?? 'null')]),
	);
}

describe('local drafts', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('上限を超えると更新の古いものから消える', async () => {
		for (let i = 0; i < MAX_LOCAL_DRAFTS + 5; i++) {
			writeLocalDraft({ accountId: i % 2 === 0 ? 'alice' : 'bob', replyId: String(i) }, draft(i), true);
		}
		await waitFor(() => expect(Object.keys(stored())).toHaveLength(MAX_LOCAL_DRAFTS));
		expect(readLocalDraft({ accountId: 'alice', replyId: '4' })).toBeUndefined();
		expect(readLocalDraft({ accountId: 'bob', replyId: '5' })).toEqual(draft(5));
		expect(readLocalDraft({ accountId: 'alice', replyId: String(MAX_LOCAL_DRAFTS + 4) })).toEqual(
			draft(MAX_LOCAL_DRAFTS + 4),
		);
	});

	test('更新日時の読めない下書きは先に消える', () => {
		const drafts: Record<string, unknown> = { broken: { data: {} }, old: draft(0), new: draft(1) };
		expect(Object.keys(pruneLocalDrafts(drafts, 2)).sort()).toEqual(['new', 'old']);
	});

	test('中身が空になった下書きは残さない', () => {
		writeLocalDraft({ accountId: 'me' }, draft(0), true);
		writeLocalDraft({ accountId: 'me' }, draft(1, ''), false);
		expect(readLocalDraft({ accountId: 'me' })).toBeUndefined();
	});

	test.each<Partial<LocalDraftScope>>([
		{},
		{ replyId: 'target' },
		{ renoteId: 'target' },
		{ channelId: 'channel' },
		{ channelId: 'channel', replyId: 'target' },
		{ channelId: 'channel', renoteId: 'target' },
	])('別アカウントの同じ投稿先の下書きを復元・上書き・削除しない: %j', (target) => {
		const alice = { ...target, accountId: 'alice' };
		const bob = { ...target, accountId: 'bob' };
		writeLocalDraft(alice, draft(0, 'alice draft'), true);
		expect(readLocalDraft(bob)).toBeUndefined();
		writeLocalDraft(bob, draft(1, 'bob draft'), true);
		expect(readLocalDraft(alice)).toEqual(draft(0, 'alice draft'));
		expect(readLocalDraft(bob)).toEqual(draft(1, 'bob draft'));
		deleteLocalDraft(bob);
		expect(readLocalDraft(bob)).toBeUndefined();
		expect(readLocalDraft(alice)).toEqual(draft(0, 'alice draft'));
	});

	test('投稿先・チャンネルごとに復元し、他の投稿先の削除に影響されない', () => {
		const targets: LocalDraftScope[] = [
			{ accountId: 'alice' },
			{ accountId: 'alice', replyId: 'target' },
			{ accountId: 'alice', renoteId: 'target' },
			{ accountId: 'alice', channelId: 'channel' },
			{ accountId: 'alice', channelId: 'channel', replyId: 'target' },
			{ accountId: 'alice', channelId: 'other', replyId: 'target' },
		];
		targets.forEach((target, index) => writeLocalDraft(target, draft(index, `draft ${index}`), true));
		deleteLocalDraft(targets[4]!);
		targets.forEach((target, index) => {
			expect(readLocalDraft(target)).toEqual(index === 4 ? undefined : draft(index, `draft ${index}`));
		});
	});

	test('非 secure context の crypto でも下書きを保存・復元・削除できる', () => {
		const getRandomValues = crypto.getRandomValues.bind(crypto);
		vi.stubGlobal('crypto', { getRandomValues });
		try {
			writeLocalDraft({ accountId: 'alice' }, draft(0, 'http draft'), true);
			writeLocalDraft({ accountId: 'bob' }, draft(1, 'other draft'), true);
			expect(readLocalDraft({ accountId: 'alice' })).toEqual(draft(0, 'http draft'));
			expect(readLocalDraft({ accountId: 'bob' })).toEqual(draft(1, 'other draft'));
			deleteLocalDraft({ accountId: 'alice' });
			expect(readLocalDraft({ accountId: 'alice' })).toBeUndefined();
			expect(readLocalDraft({ accountId: 'bob' })).toEqual(draft(1, 'other draft'));
		} finally {
			vi.unstubAllGlobals();
		}
	});

	test('保存中に別の投稿先が更新されても両方の下書きを保持する', () => {
		const getItem = Storage.prototype.getItem;
		let interleaved = false;
		const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
			const snapshot = getItem.call(this, key);
			if (!interleaved) {
				interleaved = true;
				writeLocalDraft({ accountId: 'bob', replyId: 'other' }, draft(1, 'bob draft'), true);
			}
			return snapshot;
		});
		try {
			writeLocalDraft({ accountId: 'alice', replyId: 'target' }, draft(0, 'alice draft'), true);
			expect(readLocalDraft({ accountId: 'alice', replyId: 'target' })).toEqual(draft(0, 'alice draft'));
			expect(readLocalDraft({ accountId: 'bob', replyId: 'other' })).toEqual(draft(1, 'bob draft'));
		} finally {
			spy.mockRestore();
		}
	});

	test('所有者の明確な保存形式を復元し、他アカウントから選ばない', () => {
		window.localStorage.setItem(
			'miux:local-draft:fixture-normal',
			JSON.stringify({
				scope: '["alice",null,"note",null]',
				stamp: 1,
				draft: draft(0, 'normal draft'),
			}),
		);
		window.localStorage.setItem(
			'miux:local-draft:fixture-channel',
			JSON.stringify({ scope: '["alice","channel","note",null]', stamp: 1, draft: draft(1, 'channel draft') }),
		);
		expect(readLocalDraft({ accountId: 'alice' })).toEqual(draft(0, 'normal draft'));
		expect(readLocalDraft({ accountId: 'alice', channelId: 'channel' })).toEqual(draft(1, 'channel draft'));
		expect(readLocalDraft({ accountId: 'bob' })).toBeUndefined();
		expect(readLocalDraft({ accountId: 'bob', channelId: 'channel' })).toBeUndefined();
	});

	test('整理のロックを待つ間も入力と削除を同期で確定する', async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const held = navigator.locks.request('misskey:local-draft-pruning', () => {
			entered.resolve();
			return release.promise;
		});
		await entered.promise;
		try {
			writeLocalDraft({ accountId: 'alice' }, draft(0, 'final input'), true);
			expect(readLocalDraft({ accountId: 'alice' })).toEqual(draft(0, 'final input'));
			deleteLocalDraft({ accountId: 'alice' });
			expect(readLocalDraft({ accountId: 'alice' })).toBeUndefined();
		} finally {
			release.resolve();
			await held;
		}
	});

	test('削除した投稿先は整理前の古い版が残っても復活しない', async () => {
		writeLocalDraft({ accountId: 'alice' }, draft(0, 'old draft'), true);
		const oldKey = Object.keys(stored())[0];
		if (!oldKey) throw new Error('Stored draft version was not found');
		const oldValue = window.localStorage.getItem(oldKey);
		if (!oldValue) throw new Error('Stored draft version was empty');
		deleteLocalDraft({ accountId: 'alice' });
		await waitFor(() => expect(window.localStorage.getItem(oldKey)).toBeNull());
		window.localStorage.setItem(oldKey, oldValue);
		expect(readLocalDraft({ accountId: 'alice' })).toBeUndefined();
	});

	test('整理対象の snapshot の後に保存された版を古い版と一緒に消さない', async () => {
		const removeItem = Storage.prototype.removeItem;
		let interleaved = false;
		const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
			if (!interleaved && key.startsWith('miux:local-draft:')) {
				interleaved = true;
				writeLocalDraft({ accountId: 'alice', replyId: '0' }, draft(100, 'fresh draft'), true);
			}
			removeItem.call(this, key);
		});
		try {
			for (let i = 0; i <= MAX_LOCAL_DRAFTS; i++) {
				writeLocalDraft({ accountId: 'alice', replyId: String(i) }, draft(i), true);
			}
			await waitFor(() => expect(interleaved).toBe(true));
			expect(readLocalDraft({ accountId: 'alice', replyId: '0' })).toEqual(draft(100, 'fresh draft'));
		} finally {
			spy.mockRestore();
		}
	});
});
