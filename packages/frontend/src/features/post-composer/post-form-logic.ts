/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import type { PollEditorModelValue } from '@/features/post-composer/components/MkPollEditor.vue';
import { isJsonObject, isStringArray } from '@/local-storage.js';

export type NoteVisibility = 'public' | 'home' | 'followers' | 'specified';

type ReactionAcceptance =
	| 'likeOnly'
	| 'likeOnlyForRemote'
	| 'nonSensitiveOnly'
	| 'nonSensitiveOnlyForLocalLikeOnlyForRemote'
	| null;

/** 端末下書きと投稿の両方が読む、フォームの入力内容。 */
export type PostFormFields = {
	text: string;
	useCw: boolean;
	cw: string | null;
	visibility: NoteVisibility;
	localOnly: boolean;
	files: Misskey.entities.DriveFile[];
	poll: PollEditorModelValue | null;
	visibleUserIds: string[];
	quoteId: string | null;
	reactionAcceptance: ReactionAcceptance;
	scheduledAt: number | null;
};

export type StoredLocalDraft = {
	updatedAt: string;
	data: Omit<PostFormFields, 'visibleUserIds'> & { visibleUserIds?: string[] };
};

export function serializeLocalDraft(fields: PostFormFields, now: Date): StoredLocalDraft {
	return {
		updatedAt: now.toISOString(),
		data: {
			text: fields.text,
			useCw: fields.useCw,
			cw: fields.cw,
			visibility: fields.visibility,
			localOnly: fields.localOnly,
			files: fields.files,
			poll: fields.poll,
			...(fields.visibleUserIds.length > 0 ? { visibleUserIds: fields.visibleUserIds } : {}),
			quoteId: fields.quoteId,
			reactionAcceptance: fields.reactionAcceptance,
			scheduledAt: fields.scheduledAt,
		},
	};
}

/** 本文・CW・ファイル・投票のどれも無い下書きは保存しない (空の下書きで復元確認を出さない)。 */
export function hasLocalDraftContent(
	fields: Pick<PostFormFields, 'text' | 'useCw' | 'cw' | 'files' | 'poll'>,
): boolean {
	return (
		fields.text.trim() !== '' ||
		(fields.useCw && (fields.cw ?? '') !== '') ||
		fields.files.length > 0 ||
		fields.poll != null
	);
}

const visibilities: readonly unknown[] = ['public', 'home', 'followers', 'specified'];
const reactionAcceptances: readonly unknown[] = [
	'likeOnly',
	'likeOnlyForRemote',
	'nonSensitiveOnly',
	'nonSensitiveOnlyForLocalLikeOnlyForRemote',
	null,
];

/**
 * 端末に保存された下書きのうち、型が合う項目だけを返す。端末の値は古い版や手書きで壊れていることがあるため、
 * 型の合わない項目は無視してフォームの現在値を残す。
 */
export function parseLocalDraft(raw: unknown): Partial<PostFormFields> | null {
	if (!isJsonObject(raw) || !isJsonObject(raw['data'])) {
		return null;
	}
	const data = raw['data'];
	const fields: Partial<PostFormFields> = {};
	if (typeof data['text'] === 'string') {
		fields.text = data['text'];
	}
	if (typeof data['useCw'] === 'boolean') {
		fields.useCw = data['useCw'];
	}
	if (typeof data['cw'] === 'string' || data['cw'] === null) {
		fields.cw = data['cw'];
	}
	if (visibilities.includes(data['visibility'])) {
		fields.visibility = data['visibility'] as NoteVisibility;
	}
	if (typeof data['localOnly'] === 'boolean') {
		fields.localOnly = data['localOnly'];
	}
	if (Array.isArray(data['files'])) {
		fields.files = data['files'].filter(isJsonObject) as Misskey.entities.DriveFile[];
	}
	if (isJsonObject(data['poll'])) {
		fields.poll = data['poll'] as PollEditorModelValue;
	}
	if (isStringArray(data['visibleUserIds'])) {
		fields.visibleUserIds = data['visibleUserIds'];
	}
	if (typeof data['quoteId'] === 'string' || data['quoteId'] === null) {
		fields.quoteId = data['quoteId'];
	}
	if (reactionAcceptances.includes(data['reactionAcceptance'])) {
		fields.reactionAcceptance = data['reactionAcceptance'] as ReactionAcceptance;
	}
	if (
		(typeof data['scheduledAt'] === 'number' && Number.isFinite(data['scheduledAt'])) ||
		data['scheduledAt'] === null
	) {
		fields.scheduledAt = data['scheduledAt'];
	}
	return fields;
}

/** 返信時に本文の先頭へ入れる、返信先の投稿者と本文中のメンション (自分は除く)。 */
export function replyMentionText(
	reply: Pick<Misskey.entities.Note, 'text'> & { user: Pick<Misskey.entities.UserLite, 'username' | 'host'> },
	me: Pick<Misskey.entities.UserLite, 'username'>,
	localHost: string,
	initialText: string,
): string {
	let text = initialText;
	if (reply.user.username !== me.username || (reply.user.host != null && reply.user.host !== localHost)) {
		text = `@${reply.user.username}${reply.user.host != null ? '@' + reply.user.host : ''} `;
	}
	if (reply.text == null) {
		return text;
	}
	const otherHost = reply.user.host;
	for (const x of mfm.extractMentions(mfm.parse(reply.text))) {
		const mention = x.host
			? `@${x.username}@${x.host}`
			: otherHost == null || otherHost === localHost
				? `@${x.username}`
				: `@${x.username}@${otherHost}`;
		if (me.username === x.username && (x.host == null || x.host === localHost)) {
			continue;
		}
		if (text.includes(`${mention} `)) {
			continue;
		}
		text += `${mention} `;
	}
	return text;
}

/** 返信先の公開範囲を上限とし、既に選ばれた狭い公開範囲は広げない。 */
export function visibilityForReply(replyVisibility: NoteVisibility, current: NoteVisibility): NoteVisibility {
	if (!['home', 'followers', 'specified'].includes(replyVisibility)) {
		return current;
	}
	if (replyVisibility === 'home' && current === 'followers') {
		return 'followers';
	}
	if (['home', 'followers'].includes(replyVisibility) && current === 'specified') {
		return 'specified';
	}
	return replyVisibility;
}

function isAnnoyingMfm(text: string): boolean {
	return (
		text.includes('$[x2') ||
		text.includes('$[x3') ||
		text.includes('$[x4') ||
		text.includes('$[scale') ||
		text.includes('$[position')
	);
}

/** 公開投稿で、表示されるほう (CW があれば CW、無ければ本文) に大きく動く MFM があるか。 */
export function mayBeAnnoyingPublicPost(fields: Pick<PostFormFields, 'visibility' | 'useCw' | 'cw' | 'text'>): boolean {
	if (fields.visibility !== 'public') {
		return false;
	}
	const hasCw = fields.useCw && fields.cw != null && fields.cw.trim() !== '';
	if (hasCw) {
		return isAnnoyingMfm(fields.cw!);
	}
	return fields.text.trim() !== '' && isAnnoyingMfm(fields.text);
}

/** 投稿時の設定 (ハッシュタグ欄) を本文の最終行へ付け足す。 */
export function appendHashtags(text: string | null, hashtags: string): string {
	const tags = hashtags
		.trim()
		.split(' ')
		.map((x) => (x.startsWith('#') ? x : '#' + x))
		.join(' ');
	if (!text) {
		return tags;
	}
	const lines = text.split('\n');
	const lastLineIndex = lines.length - 1;
	const lastLine = lines[lastLineIndex] ?? '';
	lines[lastLineIndex] = lastLine.trim() === '' ? lastLine + tags : lastLine + ' ' + tags;
	return lines.join('\n');
}

export function buildNotesCreateRequest(
	fields: PostFormFields,
	targets: {
		replyId: string | null;
		renoteId: string | null;
		channelId: string | null;
		hashtags: string | null;
	},
): Misskey.entities.NotesCreateRequest {
	const renoteId = targets.renoteId ?? (fields.quoteId || null);
	const request: Misskey.entities.NotesCreateRequest = {
		text: fields.text === '' ? null : fields.text,
		...(fields.files.length > 0 ? { fileIds: fields.files.map((f) => f.id) } : {}),
		...(targets.replyId != null ? { replyId: targets.replyId } : {}),
		...(renoteId != null ? { renoteId } : {}),
		...(targets.channelId != null ? { channelId: targets.channelId } : {}),
		poll: fields.poll,
		cw: fields.useCw ? (fields.cw ?? '') : null,
		localOnly: fields.visibility === 'specified' ? false : fields.localOnly,
		visibility: fields.visibility,
		...(fields.visibility === 'specified' ? { visibleUserIds: fields.visibleUserIds } : {}),
		reactionAcceptance: fields.reactionAcceptance,
	};
	if (targets.hashtags != null && targets.hashtags.trim() !== '') {
		request.text = appendHashtags(request.text ?? null, targets.hashtags);
	}
	return request;
}

export function extractHashtags(text: string): string[] {
	return mfm
		.parse(text)
		.map((x) => x.type === 'hashtag' && x.props.hashtag)
		.filter((x) => x) as string[];
}

const brainDiverUrls = [
	'https://youtu.be/Efrlqw8ytg4',
	'https://www.youtube.com/watch?v=Efrlqw8ytg4',
	'https://m.youtube.com/watch?v=Efrlqw8ytg4',

	'https://youtu.be/XVCwzwxdHuA',
	'https://www.youtube.com/watch?v=XVCwzwxdHuA',
	'https://m.youtube.com/watch?v=XVCwzwxdHuA',

	'https://open.spotify.com/track/3Cuj0mZrlLoXx9nydNi7RB',
	'https://open.spotify.com/track/7anfcaNPQWlWCwyCHmZqNy',
	'https://open.spotify.com/track/5Odr16TvEN4my22K9nbH7l',
	'https://open.spotify.com/album/5bOlxyl4igOrp2DwVQxBco',
];

/** 投稿の内容と時刻から得られる実績 (投稿数による実績は呼び出し元が数える)。 */
export function postAchievements(
	text: string,
	options: { quotesOwnNote: boolean; postedAt: Date },
): ('iLoveMisskey' | 'brainDiver' | 'selfQuote' | 'postedAtLateNight' | 'postedAt0min0sec')[] {
	const achievements: ReturnType<typeof postAchievements> = [];
	const lowerCase = text.toLowerCase();
	if (
		(lowerCase.includes('love') || lowerCase.includes('❤')) &&
		(lowerCase.includes('toneriko') || lowerCase.includes('misskey'))
	) {
		achievements.push('iLoveMisskey');
	}
	if (brainDiverUrls.some((url) => text.includes(url))) {
		achievements.push('brainDiver');
	}
	if (options.quotesOwnNote && text.length > 0) {
		achievements.push('selfQuote');
	}
	const h = options.postedAt.getHours();
	if (h >= 0 && h <= 3) {
		achievements.push('postedAtLateNight');
	}
	if (options.postedAt.getMinutes() === 0 && options.postedAt.getSeconds() === 0) {
		achievements.push('postedAt0min0sec');
	}
	return achievements;
}
