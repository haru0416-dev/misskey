/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { listUserListMembershipUserIdsByUserListIdFromDatabase } from '@/core/user/UserListMembershipStore.js';
import { userListExistsByIdAndUserIdFromDatabase } from '@/core/user/UserListStore.js';
import {
	filterNoteForStreamingHidingForApi,
	populateMyReactionForApi,
	type ApiNoteDependencies,
} from '@/server/rest/note/note.js';
import {
	isNoteMutedOrBlockedForStream,
	isNoteVisibleForMeForStream,
	type StreamChannelDefinition,
} from '../channel.js';

type MembershipCacheEntry = {
	// メンバーシップ取得クエリは withReplies を選択しないため、常に undefined になる。
	withReplies: boolean | undefined;
};

export const honoStreamChannelUserList: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params['listId'] !== 'string') return false;
		const listId = params['listId'];
		const withFiles = !!(params['withFiles'] ?? false);
		const withRenotes = !!(params['withRenotes'] ?? true);

		// requireCredential=false だが内部では ctx.user を前提とするため、未ログイン時は例外になる。
		const user = ctx.user!;

		const listExist = await userListExistsByIdAndUserIdFromDatabase(deps.db, listId, user.id);
		if (!listExist) return false;

		let membershipsMap: Record<string, MembershipCacheEntry | undefined> = {};

		const updateListUsers = async () => {
			const memberIds = await listUserListMembershipUserIdsByUserListIdFromDatabase(deps.db, listId);
			const updated: Record<string, MembershipCacheEntry | undefined> = {};
			for (const userId of memberIds) {
				updated[userId] = { withReplies: undefined };
			}
			membershipsMap = updated;
		};

		const onUserListStream = (data: { type: string; body: unknown }) => {
			ctx.send(data.type, data.body as never);
		};

		const onNote = async (note: Packed<'Note'>) => {
			const isMe = user.id === note.userId;

			// チャンネル投稿は無視する
			if (note.channelId) return;

			if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

			if (!Object.hasOwn(membershipsMap, note.userId)) return;

			if (!isNoteVisibleForMeForStream(ctx, note)) return;

			if (note.reply) {
				const reply = note.reply;
				if (membershipsMap[note.userId]?.withReplies) {
					// 自分のフォローしていないユーザーの visibility: followers な投稿への返信は弾く
					if (reply.visibility === 'followers' && !Object.hasOwn(ctx.following, reply.userId)) return;
				} else {
					// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
					if (reply.userId !== user.id && !isMe && reply.userId !== note.userId) return;
				}
			}

			if (isRenotePacked(note) && !isQuotePacked(note) && !withRenotes) return;

			if (isNoteMutedOrBlockedForStream(ctx, note)) return;

			const filtered = await filterNoteForStreamingHidingForApi(deps, note, user.id);
			if (!filtered) return;

			if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
				if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
					filtered.renote.myReaction = await populateMyReactionForApi(
						deps,
						{
							id: filtered.renote.id,
							reactions: filtered.renote.reactions,
							reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
						},
						user.id,
					);
				}
			}

			ctx.send('note', filtered);
		};

		ctx.subscriber.on(`userListStream:${listId}`, onUserListStream);
		ctx.subscriber.on('notesStream', onNote);

		await updateListUsers();
		const listUsersClock = setInterval(() => void updateListUsers(), 5000);

		return {
			dispose: () => {
				ctx.subscriber.off(`userListStream:${listId}`, onUserListStream);
				ctx.subscriber.off('notesStream', onNote);
				clearInterval(listUsersClock);
			},
		};
	},
};
