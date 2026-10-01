/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Misskey from 'misskey-js';
import {
	appendHashtags,
	buildNotesCreateRequest,
	hasLocalDraftContent,
	mayBeAnnoyingPublicPost,
	parseLocalDraft,
	postAchievements,
	replyMentionText,
	serializeLocalDraft,
	visibilityForReply,
} from '@/features/post-composer/post-form-logic.js';
import type { PostFormFields } from '@/features/post-composer/post-form-logic.js';

const file = { id: 'file1' } as Misskey.entities.DriveFile;

function fields(overrides: Partial<PostFormFields> = {}): PostFormFields {
	return {
		text: 'hello',
		useCw: false,
		cw: null,
		visibility: 'public',
		localOnly: false,
		files: [],
		poll: null,
		visibleUserIds: [],
		quoteId: null,
		reactionAcceptance: null,
		scheduledAt: null,
		...overrides,
	};
}

const noTargets = { replyId: null, renoteId: null, channelId: null, hashtags: null };

describe('端末下書き', () => {
	test('保存した内容をそのまま復元でき、宛先が無ければ visibleUserIds を書かない', () => {
		const saved = serializeLocalDraft(fields({ files: [file], visibility: 'home' }), new Date(0));
		expect(saved.data).not.toHaveProperty('visibleUserIds');
		// 投票なし (null) はフォームの現在値を残すので、復元される項目に含めない。
		const { visibleUserIds: _, poll: __, ...restored } = fields({ files: [file], visibility: 'home' });
		expect(parseLocalDraft(JSON.parse(JSON.stringify(saved)))).toEqual(restored);

		const specified = serializeLocalDraft(fields({ visibility: 'specified', visibleUserIds: ['u1'] }), new Date(0));
		expect(parseLocalDraft(specified)?.visibleUserIds).toEqual(['u1']);
	});

	test('型の合わない項目だけを捨て、他の項目は復元する', () => {
		expect(
			parseLocalDraft({
				data: {
					text: 1,
					useCw: true,
					cw: 'cw',
					visibility: 'everyone',
					localOnly: 'yes',
					files: [file, 'x', null],
					poll: [],
					visibleUserIds: ['u1', 2],
					quoteId: null,
					reactionAcceptance: 'all',
					scheduledAt: Number.POSITIVE_INFINITY,
				},
			}),
		).toEqual({ useCw: true, cw: 'cw', files: [file], quoteId: null });
	});

	test('形の違う値は下書きとして扱わない', () => {
		expect(parseLocalDraft(null)).toBeNull();
		expect(parseLocalDraft({ data: 'text' })).toBeNull();
		expect(parseLocalDraft([])).toBeNull();
	});

	test('本文・CW・ファイル・投票のどれかがあるときだけ内容ありとみなす', () => {
		expect(hasLocalDraftContent(fields({ text: '  ' }))).toBe(false);
		expect(hasLocalDraftContent(fields({ text: '', useCw: false, cw: 'hidden' }))).toBe(false);
		expect(hasLocalDraftContent(fields({ text: '', useCw: true, cw: 'cw' }))).toBe(true);
		expect(hasLocalDraftContent(fields({ text: '', files: [file] }))).toBe(true);
	});
});

describe('投稿リクエスト', () => {
	test('指名投稿は宛先を付け、連合なしにしない', () => {
		expect(
			buildNotesCreateRequest(fields({ visibility: 'specified', localOnly: true, visibleUserIds: ['u1'] }), noTargets),
		).toMatchObject({ visibility: 'specified', localOnly: false, visibleUserIds: ['u1'] });
		expect(buildNotesCreateRequest(fields({ visibleUserIds: ['u1'] }), noTargets)).not.toHaveProperty('visibleUserIds');
	});

	test('リノート対象が無ければ引用 ID を使い、空の本文は null にする', () => {
		const request = buildNotesCreateRequest(fields({ text: '', quoteId: 'q1', useCw: true, cw: null }), noTargets);
		expect(request).toMatchObject({ text: null, renoteId: 'q1', cw: '' });
		expect(buildNotesCreateRequest(fields({ quoteId: 'q1' }), { ...noTargets, renoteId: 'r1' }).renoteId).toBe('r1');
		expect(buildNotesCreateRequest(fields({ quoteId: '' }), noTargets)).not.toHaveProperty('renoteId');
	});

	test('ハッシュタグは本文の最終行に足す', () => {
		expect(buildNotesCreateRequest(fields({ text: '' }), { ...noTargets, hashtags: 'a #b' }).text).toBe('#a #b');
		expect(appendHashtags('line1\nline2', 'tag')).toBe('line1\nline2 #tag');
		expect(appendHashtags('line1\n', 'tag')).toBe('line1\n#tag');
		expect(buildNotesCreateRequest(fields(), { ...noTargets, hashtags: '  ' }).text).toBe('hello');
	});
});

describe('投稿前の確認', () => {
	test('公開投稿で表示されるほうに大きく動く MFM があるときだけ確認する', () => {
		expect(mayBeAnnoyingPublicPost(fields({ text: '$[x2 big]' }))).toBe(true);
		expect(mayBeAnnoyingPublicPost(fields({ text: '$[x2 big]', visibility: 'home' }))).toBe(false);
		expect(mayBeAnnoyingPublicPost(fields({ text: '$[x2 big]', useCw: true, cw: 'calm' }))).toBe(false);
		expect(mayBeAnnoyingPublicPost(fields({ text: 'calm', useCw: true, cw: '$[scale.x=3 cw]' }))).toBe(true);
		expect(mayBeAnnoyingPublicPost(fields({ text: '$[x3 big]', useCw: true, cw: '  ' }))).toBe(true);
	});
});

describe('返信', () => {
	const me = { username: 'alice' };
	const reply = (user: { username: string; host: string | null }, text: string | null) => ({ user, text });

	test('返信先と本文中のメンションを、自分と重複を除いて並べる', () => {
		expect(
			replyMentionText(
				reply({ username: 'bob', host: 'remote.example' }, '@carol @alice @dave@other.example'),
				me,
				'local.example',
				'',
			),
		).toBe('@bob@remote.example @carol@remote.example @dave@other.example ');
		expect(replyMentionText(reply({ username: 'alice', host: null }, '@bob @bob'), me, 'local.example', 'hi ')).toBe(
			'hi @bob ',
		);
	});

	test('返信先の公開範囲より広げず、選んだ狭い範囲は保つ', () => {
		expect(visibilityForReply('public', 'home')).toBe('home');
		expect(visibilityForReply('home', 'public')).toBe('home');
		expect(visibilityForReply('home', 'followers')).toBe('followers');
		expect(visibilityForReply('followers', 'specified')).toBe('specified');
		expect(visibilityForReply('specified', 'public')).toBe('specified');
	});
});

describe('実績', () => {
	test('内容と時刻から得られる実績を返す', () => {
		expect(
			postAchievements('I love Toneriko https://youtu.be/Efrlqw8ytg4', {
				quotesOwnNote: true,
				postedAt: new Date(2026, 0, 1, 2, 0, 0),
			}),
		).toEqual(['iLoveMisskey', 'brainDiver', 'selfQuote', 'postedAtLateNight', 'postedAt0min0sec']);
		expect(postAchievements('', { quotesOwnNote: true, postedAt: new Date(2026, 0, 1, 12, 1, 0) })).toEqual([]);
	});
});
