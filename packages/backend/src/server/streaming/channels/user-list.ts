/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { listUserListMembershipUserIdsByUserListIdFromDatabase } from '@/core/UserListMembershipStore.js';
import { userListExistsByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import {
	filterNoteForStreamingHidingForHonoApi,
	populateMyReactionForHonoApi,
	type HonoApiNoteDependencies,
} from '../../rest/note.js';
import {
	isNoteMutedOrBlockedForHonoStream,
	isNoteVisibleForMeForHonoStream,
	type HonoStreamChannelDefinition,
} from '../channel.js';

type MembershipCacheEntry = {
	// NOTE: 既存実装は withReplies を取得していなかったため、値は常に undefined
	// になっていた(既存挙動を保持するため踏襲)。
	withReplies: boolean | undefined;
};

export const honoStreamChannelUserList: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params['listId'] !== 'string') return false;
		const listId = params['listId'];
		const withFiles = !!(params['withFiles'] ?? false);
		const withRenotes = !!(params['withRenotes'] ?? true);

		// NOTE: 元実装同様 requireCredential=false だが内部では this.user を前提としている (未ログイン時は例外)
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

			if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;

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

			if (isNoteMutedOrBlockedForHonoStream(ctx, note)) return;

			const filtered = await filterNoteForStreamingHidingForHonoApi(deps, note, user.id);
			if (!filtered) return;

			if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
				if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
					filtered.renote.myReaction = await populateMyReactionForHonoApi(
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
