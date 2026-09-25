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
			writeLocalDraft(`reply:${i}`, draft(i), true);
		}
		const keys = Object.keys(stored());
		expect(keys).toHaveLength(MAX_LOCAL_DRAFTS);
		expect(keys).not.toContain('reply:4');
		expect(keys).toContain('reply:5');
		expect(readLocalDraft(`reply:${MAX_LOCAL_DRAFTS + 4}`)).toEqual(draft(MAX_LOCAL_DRAFTS + 4));
	});

	test('更新日時の読めない下書きは先に消える', () => {
		const drafts: Record<string, unknown> = { broken: { data: {} }, old: draft(0), new: draft(1) };
		expect(Object.keys(pruneLocalDrafts(drafts, 2)).sort()).toEqual(['new', 'old']);
	});

	test('中身が空になった下書きは残さない', () => {
		writeLocalDraft('note:me', draft(0), true);
		writeLocalDraft('note:me', draft(1, ''), false);
		expect(stored()).toEqual({});
	});

	test('中身の無い下書きの保存では他の下書きを書き換えない', () => {
		writeLocalDraft('note:me', draft(0), true);
		const before = window.localStorage.getItem('drafts');
		writeLocalDraft('reply:1', draft(1, ''), false);
		expect(window.localStorage.getItem('drafts')).toBe(before);
	});

	test('削除は対象の鍵だけを消す', () => {
		writeLocalDraft('a', draft(0), true);
		writeLocalDraft('b', draft(1), true);
		deleteLocalDraft('a');
		expect(Object.keys(stored())).toEqual(['b']);
	});
});
