/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EventEmitter } from 'node:events';
import { isChannelRelated } from '@/misc/is-channel-related.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForApi, populateMyReactionForApi } from '@/server/rest/note/note.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import type { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiUser } from '@/models/User.js';
import type { Awaitable } from '@/types.js';

export type StreamChannelSubscriber = {
	on: (eventName: string | symbol, listener: Parameters<EventEmitter['on']>[1]) => void;
	off: (eventName: string | symbol, listener: Parameters<EventEmitter['off']>[1]) => void;
};

/**
 * channel 初期化時点のフォロー・ミュート・ブロック関係を保持するスナップショット。
 */
export type StreamChannelContext = {
	id: string;
	user?: MiUser;
	token?: MiAccessToken;
	userProfile: MiUserProfile | null;
	following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined>;
	followingChannels: Set<string>;
	mutingChannels: Set<string>;
	userIdsWhoMeMuting: Set<string>;
	userIdsWhoMeMutingRenotes: Set<string>;
	userIdsWhoBlockingMe: Set<string>;
	userMutedInstances: Set<string>;
	subscriber: StreamChannelSubscriber;
	send: (type: string, body: JsonValue) => void;
};

export function isNoteVisibleForMeForStream(ctx: StreamChannelContext, note: Packed<'Note'>): boolean {
	const meId = ctx.user?.id ?? null;

	if (note.visibility === 'specified') {
		if (meId == null) {
			return false;
		}
		if (meId === note.userId) {
			return true;
		}
		return note.visibleUserIds?.includes(meId) ?? false;
	}

	if (note.visibility === 'followers') {
		if (meId == null) {
			return false;
		}
		if (meId === note.userId) {
			return true;
		}
		if (note.reply && meId === note.reply.userId) {
			return true;
		}
		if (note.mentions && note.mentions.includes(meId)) {
			return true;
		}
		return Object.hasOwn(ctx.following, note.userId);
	}

	return true;
}

export function isNoteMutedOrBlockedForStream(ctx: StreamChannelContext, note: Packed<'Note'>): boolean {
	if (isInstanceMuted(note, ctx.userMutedInstances)) {
		return true;
	}
	if (isUserRelated(note, ctx.userIdsWhoMeMuting)) {
		return true;
	}
	if (isUserRelated(note, ctx.userIdsWhoBlockingMe)) {
		return true;
	}
	if (isRenotePacked(note) && !isQuotePacked(note) && ctx.userIdsWhoMeMutingRenotes.has(note.user.id)) {
		return true;
	}
	if (isChannelRelated(note, ctx.mutingChannels)) {
		return true;
	}
	return false;
}

type SigninRequirement = { requireSigninToViewContents?: boolean };

/** 未ログインの接続に、閲覧にサインインが必要な投稿者 (本体・リノート元・返信先) の投稿を流さない。 */
export function requiresSigninForStream(ctx: StreamChannelContext, note: Packed<'Note'>): boolean {
	if (ctx.user != null) return false;
	return [note.user, note.renote?.user, note.reply?.user].some(
		(user) => (user as SigninRequirement | undefined)?.requireSigninToViewContents === true,
	);
}

/** 非表示の処理を通し、リノート元への自分のリアクションを埋めてから送る。 */
export async function sendNoteToStream(
	deps: ApiNoteDependencies,
	ctx: StreamChannelContext,
	note: Packed<'Note'>,
): Promise<void> {
	const filtered = await filterNoteForStreamingHidingForApi(deps, note, ctx.user?.id ?? null);
	if (!filtered) return;
	const renote = filtered.renote;
	if (
		ctx.user &&
		isRenotePacked(filtered) &&
		!isQuotePacked(filtered) &&
		renote &&
		Object.keys(renote.reactions).length > 0
	) {
		renote.myReaction = await populateMyReactionForApi(
			deps,
			{ id: renote.id, reactions: renote.reactions, reactionAndUserPairCache: renote.reactionAndUserPairCache ?? [] },
			ctx.user.id,
		);
	}
	ctx.send('note', filtered);
}

export type StreamChannelHandle = {
	dispose?: () => void;
	onMessage?: (type: string, body: JsonValue) => void;
};

/**
 * `init` が `false` を返す/初期化不可の場合は接続を拒否する。
 */
export type StreamChannelDefinition<Deps> = {
	shouldShare: boolean;
	requireCredential: boolean;
	kind: string | null;
	init: (deps: Deps, ctx: StreamChannelContext, params: JsonObject) => Awaitable<StreamChannelHandle | false | void>;
};
