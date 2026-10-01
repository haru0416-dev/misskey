/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny } from '@/misc/to-puny.js';
import type * as Redis from 'ioredis';
import { compactAntennaKeywords, matchesAntennaKeywords } from '@/core/antenna/antenna-keywords.js';
import {
	appendUserToAntennasInDatabase,
	listActiveAntennasFromDatabase,
	listAntennasByIdsFromDatabase,
} from '@/core/antenna/AntennaStore.js';
import {
	followingExistsInDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
} from '@/core/user/FollowingStore.js';
import {
	listUserListIdsContainingUserFromDatabase,
	userListMembershipExistsInDatabase,
} from '@/core/user/UserListMembershipStore.js';
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

export async function checkHitAntenna(
	deps: Pick<AntennaFanoutDependencies, 'config' | 'db'>,
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
	hint?: {
		listMembershipUserListIds: Set<string>;
		followerIds?: Set<MiUser['id']>;
	},
): Promise<boolean> {
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
		const isFollowing =
			hint?.followerIds != null
				? hint.followerIds.has(antenna.userId)
				: await followingExistsInDatabase(deps.db, antenna.userId, note.userId);
		if (!isFollowing && antenna.userId !== note.userId) {
			return false;
		}
	}

	if (antenna.src === 'home') {
		// ホーム = アンテナ所有者のホームタイムラインに流れるノート (自分の投稿 + フォロー中ユーザーの投稿)。
		// hint.followerIds は「note.userId をフォローしている候補ユーザー」なので所有者が居れば follow 済み。
		if (note.userId !== antenna.userId) {
			const isFollowing =
				hint?.followerIds != null
					? hint.followerIds.has(antenna.userId)
					: await followingExistsInDatabase(deps.db, antenna.userId, note.userId);
			if (!isFollowing) {
				return false;
			}
		}
	} else if (antenna.src === 'list') {
		if (antenna.userListId == null) {
			return false;
		}
		const exists = hint
			? hint.listMembershipUserListIds.has(antenna.userListId)
			: await userListMembershipExistsInDatabase(deps.db, note.userId, antenna.userListId);
		if (!exists) {
			return false;
		}
	} else if (antenna.src === 'users') {
		if (!antennaUsersIncludes(deps.config, antenna.users, noteUser)) {
			return false;
		}
	} else if (antenna.src === 'users_blacklist') {
		if (antennaUsersIncludes(deps.config, antenna.users, noteUser)) {
			return false;
		}
	}

	const keywords = compactAntennaKeywords(antenna.keywords);
	const excludeKeywords = compactAntennaKeywords(antenna.excludeKeywords);

	if (keywords.length > 0 || excludeKeywords.length > 0) {
		if (note.text == null && note.cw == null) {
			return false;
		}

		const text = (note.text ?? '') + '\n' + (note.cw ?? '');
		if (keywords.length > 0 && !matchesAntennaKeywords(text, keywords, antenna.caseSensitive)) {
			return false;
		}
		if (excludeKeywords.length > 0 && matchesAntennaKeywords(text, excludeKeywords, antenna.caseSensitive)) {
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
 * アクティブなアンテナ一覧を DB から取得し、評価を分割して実行する。
 * fanout-timeline-push.ts と同じく直近3分以内のノートのみ即時lpushし、古いノートは末尾IDと比較する。
 */
export async function addNoteToAntennas(
	deps: AntennaFanoutDependencies,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
): Promise<void> {
	const antennas = await listActiveAntennasFromDatabase(deps.db);

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
	const followerIdSet = new Set(followerIds);

	const antennasWithMatchResult: (readonly [MiAntenna, boolean])[] = [];
	for (let index = 0; index < antennas.length; index += 50) {
		const batch = antennas.slice(index, index + 50);
		antennasWithMatchResult.push(
			...(await Promise.all(
				batch.map((antenna) =>
					checkHitAntenna(deps, antenna, note, noteUser, {
						listMembershipUserListIds,
						followerIds: followerIdSet,
					}).then((hit) => [antenna, hit] as const),
				),
			)),
		);
	}
	const matchedAntennas = antennasWithMatchResult.filter(([, hit]) => hit).map(([antenna]) => antenna);

	const push = new FanoutTimelinePush(note.id);
	for (const antenna of matchedAntennas) {
		push.add(`antennaTimeline:${antenna.id}`, 200);
	}
	await push.flush(deps.redisForTimelines);
	for (const antenna of matchedAntennas) {
		deps.publishAntennaStream?.(antenna.id, 'note', note);
	}
}
