/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny } from '@/misc/to-puny.js';
import type * as Redis from 'ioredis';
import { compileAntennaKeywords, matchesCompiledAntennaKeywords } from '@/core/antenna/antenna-keywords.js';
import {
	appendUserToAntennasInDatabase,
	listActiveAntennasFromDatabase,
	listActiveAntennasFromDatabaseCachedByVersion,
	listAntennasByIdsFromDatabase,
} from '@/core/antenna/antenna-store.js';
import { listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase } from '@/core/user/following-store.js';
import { listUserListIdsContainingUserFromDatabase } from '@/core/user/user-list-membership-store.js';
import * as Acct from '@/misc/acct.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { AntennaStreamPublisher, InternalEventPublisher } from '../events.js';
import { FanoutTimelinePush } from '../note/fanout-timeline-push.js';

export type AntennaFanoutDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redisForTimelines: Redis.Redis;
	publishAntennaStream?: AntennaStreamPublisher;
};

function getFullApAccount(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	username: string,
	host: string | null,
): string {
	return host ? `${username}@${toPuny(host)}` : `${username}@${toPuny(config.runtime.host)}`;
}

export function antennaUsersIncludes(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	users: string[],
	user: { username: string; host: string | null },
): boolean {
	const account = getFullApAccount(config, user.username, user.host).toLowerCase();
	const accountHost = toPuny(user.host ?? config.runtime.host);

	return users.some((value) => {
		const { username, host } = Acct.parse(value);
		if (username === '*' && host != null) {
			return toPuny(host) === accountHost;
		}

		return getFullApAccount(config, username, host).toLowerCase() === account;
	});
}

function passesAntennaPreconditions(
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { host: string | null; isBot: boolean },
): boolean {
	if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) {
		return false;
	}
	if (antenna.excludeBots && noteUser.isBot) {
		return false;
	}
	if (antenna.localOnly && noteUser.host != null) {
		return false;
	}
	if (!antenna.withReplies && note.replyId != null) {
		return false;
	}
	return true;
}

type AntennaMatchKeywords = { keywords: string[][]; excludeKeywords: string[][] };

// キャッシュした一覧のアンテナは凍結済みで、投稿をまたいで同じオブジェクトが渡る。
// 空語の除去と小文字化をアンテナごとに 1 度で済ませるため、オブジェクトに結び付けて持つ。
const antennaMatchKeywords = new WeakMap<MiAntenna, AntennaMatchKeywords>();

function getAntennaMatchKeywords(antenna: MiAntenna): AntennaMatchKeywords {
	let compiled = antennaMatchKeywords.get(antenna);
	if (compiled == null) {
		compiled = {
			keywords: compileAntennaKeywords(antenna.keywords, antenna.caseSensitive),
			excludeKeywords: compileAntennaKeywords(antenna.excludeKeywords, antenna.caseSensitive),
		};
		antennaMatchKeywords.set(antenna, compiled);
	}
	return compiled;
}

/** キーワード照合に使う本文 (本文 + 改行 + CW)。小文字の版は要るアンテナが現れたときに 1 度だけ作る。 */
type AntennaNoteText = { raw: string; lower: () => string };

function createAntennaNoteText(note: Pick<MiNote, 'text' | 'cw'>): AntennaNoteText | null {
	if (note.text == null && note.cw == null) {
		return null;
	}
	const raw = (note.text ?? '') + '\n' + (note.cw ?? '');
	let lower: string | undefined;
	return { raw, lower: () => (lower ??= raw.toLowerCase()) };
}

/**
 * 投稿がアンテナに入るか。DB を引かずに判定するので、フォロー関係とリスト所属は hint で渡す。
 * hint.followerIds は「投稿者をフォローしているアンテナ所有者」、hint.listMembershipUserListIds は
 * 「投稿者が入っているリスト」で、どちらも照合するアンテナ一覧について addNoteToAntennas がまとめて引く。
 */
function checkHitAntenna(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
	hint: {
		listMembershipUserListIds: ReadonlySet<string>;
		followerIds: ReadonlySet<MiUser['id']>;
	},
	text: AntennaNoteText | null,
): boolean {
	if (!passesAntennaPreconditions(antenna, note, noteUser)) {
		return false;
	}

	if (note.visibility === 'specified') {
		if (note.userId !== antenna.userId) {
			if (note.visibleUserIds == null) {
				return false;
			}
			if (!note.visibleUserIds.includes(antenna.userId)) {
				return false;
			}
		}
	}

	if (note.visibility === 'followers') {
		if (!hint.followerIds.has(antenna.userId) && antenna.userId !== note.userId) {
			return false;
		}
	}

	if (antenna.src === 'home') {
		// ホーム = アンテナ所有者のホームタイムラインに流れるノート (自分の投稿 + フォロー中ユーザーの投稿)。
		if (note.userId !== antenna.userId && !hint.followerIds.has(antenna.userId)) {
			return false;
		}
	} else if (antenna.src === 'list') {
		if (antenna.userListId == null || !hint.listMembershipUserListIds.has(antenna.userListId)) {
			return false;
		}
	} else if (antenna.src === 'users') {
		if (!antennaUsersIncludes(config, antenna.users, noteUser)) {
			return false;
		}
	} else if (antenna.src === 'users_blacklist') {
		if (antennaUsersIncludes(config, antenna.users, noteUser)) {
			return false;
		}
	}

	const { keywords, excludeKeywords } = getAntennaMatchKeywords(antenna);

	if (keywords.length > 0 || excludeKeywords.length > 0) {
		if (text == null) {
			return false;
		}

		const haystack = antenna.caseSensitive ? text.raw : text.lower();
		if (keywords.length > 0 && !matchesCompiledAntennaKeywords(haystack, keywords)) {
			return false;
		}
		if (excludeKeywords.length > 0 && matchesCompiledAntennaKeywords(haystack, excludeKeywords)) {
			return false;
		}
	}

	if (antenna.withFile) {
		if (note.fileIds?.length === 0) {
			return false;
		}
	}

	return true;
}

/**
 * アカウント移行直前の users リストを基準に対象を決めるため、アンテナ一覧は毎回DBから読む。
 */
export async function onMoveAccount(
	deps: {
		config: { runtime: Pick<Config['runtime'], 'host'> };
		db: MiDrizzleDatabase;
		publishInternalEvent?: InternalEventPublisher;
	},
	src: MiUser,
	dst: MiUser,
): Promise<void> {
	const srcUserAcct = getFullApAccount(deps.config, src.username, src.host).toLowerCase();
	const antennasToMigrate = (await listActiveAntennasFromDatabase(deps.db)).filter((antenna) => {
		return antenna.users.some((user) => {
			const { username, host } = Acct.parse(user);
			return getFullApAccount(deps.config, username, host).toLowerCase() === srcUserAcct;
		});
	});

	if (antennasToMigrate.length === 0) {
		return;
	}

	const antennaIds = antennasToMigrate.map((x) => x.id);

	const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

	await appendUserToAntennasInDatabase(deps.db, antennaIds, dstUserAcct);

	for (const newAntenna of await listAntennasByIdsFromDatabase(deps.db, antennaIds)) {
		deps.publishInternalEvent?.('antennaUpdated', newAntenna);
	}
}

/**
 * 有効なアンテナ一覧と照合し、当たったアンテナのタイムラインへ入れる。
 * antennasVersion は投稿の保存時か post-create の snapshot と同じ文で読んだアンテナ一覧の世代で、
 * 同じ世代の一覧はプロセス内で使い回す。null (世代の行が無い) なら毎回 DB から読む。
 * fanout-timeline-push.ts と同じく直近3分以内のノートのみ即時lpushし、古いノートは末尾IDと比較する。
 */
export async function addNoteToAntennas(
	deps: AntennaFanoutDependencies,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
	antennasVersion: number | null,
): Promise<void> {
	const antennas =
		antennasVersion == null
			? await listActiveAntennasFromDatabase(deps.db)
			: await listActiveAntennasFromDatabaseCachedByVersion(deps.db, antennasVersion);

	// src === 'list' なアンテナの userListId をまとめて1クエリで所属判定する (アンテナ毎の exists クエリを回避)。
	const listAntennaUserListIds = [
		...new Set(
			antennas
				.filter(
					(antenna): antenna is MiAntenna & { userListId: string } =>
						antenna.src === 'list' && antenna.userListId != null,
				)
				.map((antenna) => antenna.userListId),
		),
	];
	// followers 限定ノートの可視性判定と src === 'home' の判定はどちらも「そのアンテナの所有者が
	// ノート投稿者をフォローしているか」なので、候補をまとめて1クエリで引く。
	const followerCandidateIds = [
		...new Set(
			antennas
				.filter((antenna) => note.visibility === 'followers' || antenna.src === 'home')
				.filter((antenna) => antenna.userId !== note.userId && passesAntennaPreconditions(antenna, note, noteUser))
				.map((antenna) => antenna.userId),
		),
	];
	const [listMembershipUserListIds, followerIds] = await Promise.all([
		listUserListIdsContainingUserFromDatabase(deps.db, note.userId, listAntennaUserListIds),
		followerCandidateIds.length > 0
			? listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, note.userId, followerCandidateIds)
			: Promise.resolve([]),
	]);
	const hint = { listMembershipUserListIds, followerIds: new Set(followerIds) };
	const text = createAntennaNoteText(note);
	const matchedAntennas = antennas.filter((antenna) =>
		checkHitAntenna(deps.config, antenna, note, noteUser, hint, text),
	);

	const push = new FanoutTimelinePush(note.id);
	for (const antenna of matchedAntennas) {
		push.add(`antennaTimeline:${antenna.id}`, 200);
	}
	await push.flush(deps.redisForTimelines);
	for (const antenna of matchedAntennas) {
		deps.publishAntennaStream?.(antenna.id, 'note', note);
	}
}
