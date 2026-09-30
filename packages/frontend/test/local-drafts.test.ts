/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
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
	return JSON.parse(window.localStorage.getItem('drafts') ?? '{}');
}

describe('local drafts', () => {
	beforeEach(() => {
		window.localStorage.removeItem('drafts');
	});

	test('上限を超えると更新の古いものから消える', () => {
		for (let i = 0; i < MAX_LOCAL_DRAFTS + 5; i++) {
			writeLocalDraft({ accountId: i % 2 === 0 ? 'alice' : 'bob', replyId: String(i) }, draft(i), true);
		}
		expect(Object.keys(stored())).toHaveLength(MAX_LOCAL_DRAFTS);
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
		expect(stored()).toEqual({});
	});

	test('削除は対象の鍵だけを消す', () => {
		writeLocalDraft({ accountId: 'a' }, draft(0), true);
		writeLocalDraft({ accountId: 'b' }, draft(1), true);
		deleteLocalDraft({ accountId: 'a' });
		expect(readLocalDraft({ accountId: 'a' })).toBeUndefined();
		expect(readLocalDraft({ accountId: 'b' })).toEqual(draft(1));
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

	test('所有者不明の旧返信・引用下書きはどのアカウントにも復元しない', () => {
		window.localStorage.setItem(
			'drafts',
			JSON.stringify({
				'reply:target': draft(0, 'unknown reply'),
				'renote:target': draft(1, 'unknown quote'),
				'channel:channelreply:target': draft(2, 'unknown channel reply'),
				'channel:channelrenote:target': draft(3, 'unknown channel quote'),
			}),
		);
		for (const accountId of ['alice', 'bob']) {
			for (const channelId of [undefined, 'channel']) {
				expect(readLocalDraft({ accountId, channelId, replyId: 'target' })).toBeUndefined();
				expect(readLocalDraft({ accountId, channelId, renoteId: 'target' })).toBeUndefined();
			}
		}
	});

	test('所有者が明確な通常投稿とチャンネル投稿の既存下書きを復元できる', () => {
		window.localStorage.setItem(
			'drafts',
			JSON.stringify({
				'note:alice': draft(0, 'normal draft'),
				'channel:channelnote:alice': draft(1, 'channel draft'),
			}),
		);
		expect(readLocalDraft({ accountId: 'alice' })).toEqual(draft(0, 'normal draft'));
		expect(readLocalDraft({ accountId: 'alice', channelId: 'channel' })).toEqual(draft(1, 'channel draft'));
		expect(readLocalDraft({ accountId: 'bob' })).toBeUndefined();
		expect(readLocalDraft({ accountId: 'bob', channelId: 'channel' })).toBeUndefined();
	});
});
