/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiNote } from '@/models/Note.js';

/**
 * 注目の投稿・ハッシュタグ・ギャラリーのランキング。Redis の sorted set を時間窓ごとに分け、
 * 読むときは今の窓と 1 つ前の窓を合わせる。窓の番号は起点からの経過時間を幅で割ったもので、
 * 書き込み・読み取り・削除で同じ起点と幅を使わないと別のキーを見てしまう。
 */
const FEATURED_EPOCH = Date.parse('2023-01-01T00:00:00Z');

export const GLOBAL_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3;
export const PER_USER_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 7;
export const GALLERY_POSTS_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3;
export const HASHTAG_RANKING_WINDOW = 1000 * 60 * 60;

/** リアクション・リノートを抽出してランキングに数える割合。Redis への書き込みを抑える。 */
export const FEATURED_NOTE_ENGAGEMENT_SAMPLE_RATE = 0.3;

export function currentFeaturedWindow(windowRange: number, now: number = Date.now()): number {
	return Math.floor((now - FEATURED_EPOCH) / windowRange);
}

export async function incrementFeaturedRanking(
	redis: Redis.Redis,
	name: string,
	windowRange: number,
	element: string,
	score: number,
): Promise<void> {
	const key = `${name}:${currentFeaturedWindow(windowRange)}`;
	// 読み取りは 1 つ前の窓まで見るので、窓 3 つ分残す。期限は最初の書き込みでだけ付ける。
	await redis
		.multi()
		.zincrby(key, score, element)
		.expire(key, (windowRange * 3) / 1000, 'NX')
		.exec();
}

/**
 * 今の窓と 1 つ前の窓の点数を合わせ (両方にあれば平均)、高い順に上位 limit 件を返す。
 * 窓ごとの上位だけを読むので、合計でしか上位に入らない要素は落ちうる。
 */
export async function readFeaturedRanking(
	redis: Redis.Redis,
	name: string,
	windowRange: number,
	limit: number,
): Promise<string[]> {
	const currentWindow = currentFeaturedWindow(windowRange);
	const results = await redis
		.pipeline()
		.zrange(`${name}:${currentWindow}`, 0, String(limit - 1), 'REV', 'WITHSCORES')
		.zrange(`${name}:${currentWindow - 1}`, 0, String(limit - 1), 'REV', 'WITHSCORES')
		.exec();
	const [current = [], previous = []] = (results ?? []).map(([, value]) => (value ?? []) as string[]);

	const ranking = new Map<string, number>();
	for (let i = 0; i + 1 < current.length; i += 2) {
		ranking.set(current[i]!, Number.parseInt(current[i + 1]!, 10));
	}
	for (let i = 0; i + 1 < previous.length; i += 2) {
		const score = Number.parseInt(previous[i + 1]!, 10);
		const exist = ranking.get(previous[i]!);
		ranking.set(previous[i]!, exist != null ? (exist + score) / 2 : score);
	}

	return [...ranking.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([element]) => element);
}

export async function removeFromFeaturedRanking(
	redis: Redis.Redis,
	name: string,
	windowRange: number,
	elements: Iterable<string>,
): Promise<void> {
	const currentWindow = currentFeaturedWindow(windowRange);
	const pipeline = redis.pipeline();
	for (const element of elements) {
		pipeline.zrem(`${name}:${currentWindow}`, element);
		pipeline.zrem(`${name}:${currentWindow - 1}`, element);
	}
	await pipeline.exec();
}

export type FeaturedNoteTarget = Pick<MiNote, 'id' | 'userId' | 'userHost' | 'visibility' | 'replyId' | 'channelId'>;

/**
 * リアクション (1 点) やリノート (5 点) を注目の投稿の点数にする。投稿から 3 日以内で返信でないものだけを数え、
 * チャンネルの投稿はチャンネル内のランキングへ、それ以外は公開のローカル投稿だけを全体とユーザー別へ入れる。
 * 抽出 (FEATURED_NOTE_ENGAGEMENT_SAMPLE_RATE) は呼び出し元で行う。
 */
export async function recordFeaturedNoteEngagement(
	redis: Redis.Redis,
	note: FeaturedNoteTarget,
	score: number,
	now: number = Date.now(),
): Promise<void> {
	if (note.replyId != null || now - parseId(note.id).date.getTime() >= GLOBAL_NOTES_RANKING_WINDOW) {
		return;
	}
	if (note.channelId != null) {
		await incrementFeaturedRanking(
			redis,
			`featuredInChannelNotesRanking:${note.channelId}`,
			GLOBAL_NOTES_RANKING_WINDOW,
			note.id,
			score,
		);
		return;
	}
	if (note.visibility === 'public' && note.userHost == null) {
		await Promise.all([
			incrementFeaturedRanking(redis, 'featuredGlobalNotesRanking', GLOBAL_NOTES_RANKING_WINDOW, note.id, score),
			incrementFeaturedRanking(
				redis,
				`featuredPerUserNotesRanking:${note.userId}`,
				PER_USER_NOTES_RANKING_WINDOW,
				note.id,
				score,
			),
		]);
	}
}
