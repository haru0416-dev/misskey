/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import type { GlobalEvents } from '@/core/global-events.js';
import { listUserListMembersWithRepliesByUserListIdFromDatabase } from '@/core/user/user-list-membership-store.js';
import { userListExistsByIdAndUserIdFromDatabase } from '@/core/user/user-list-store.js';
import type { NoteDependencies } from '@/core/note/note-packing.js';
import { isNoteMutedOrBlockedForStream, isNoteVisibleForMeForStream, sendNoteToStream } from '../channel.js';
import type { StreamChannelDefinition } from '../channel.js';

type MembershipCacheEntry = {
	withReplies: boolean;
};

export const honoStreamChannelUserList: StreamChannelDefinition<NoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params['listId'] !== 'string') {
			return false;
		}
		const listId = params['listId'];
		const withFiles = !!(params['withFiles'] ?? false);
		const withRenotes = !!(params['withRenotes'] ?? true);

		// ユーザーリストは所有者の資格情報を前提とする。
		const user = ctx.user!;

		const listExist = await userListExistsByIdAndUserIdFromDatabase(deps.db, listId, user.id);
		if (!listExist) {
			return false;
		}

		let membershipsMap: Record<string, MembershipCacheEntry | undefined> = {};

		const loadListUsers = async () => {
			const members = await listUserListMembersWithRepliesByUserListIdFromDatabase(deps.db, listId);
			const updated: Record<string, MembershipCacheEntry | undefined> = {};
			for (const member of members) {
				updated[member.userId] = { withReplies: member.withReplies };
			}
			membershipsMap = updated;
		};

		// 読み直しは直列に実行する。メンバー変更の通知はコミット後に届くので、通知時点で実行中の読み直しは
		// 変更前の行を読んでいることがある。そのため実行中のものとは別に 1 回だけ後続を予約する。
		let latestRefresh: Promise<void> = Promise.resolve();
		let queuedRefresh: Promise<void> | null = null;
		const refreshListUsers = (): Promise<void> => {
			if (queuedRefresh != null) {
				return queuedRefresh;
			}
			const refresh = latestRefresh
				.catch(() => {})
				.then(() => {
					queuedRefresh = null;
					return loadListUsers();
				});
			queuedRefresh = refresh;
			latestRefresh = refresh;
			return refresh;
		};
		const refreshListUsersInBackground = () =>
			void refreshListUsers().catch((error) =>
				// 読み直しに失敗しても前回のメンバーのまま配信を続け、次の周期で読み直す。
				console.error(`Failed to refresh the members of user list ${listId}.`, error),
			);

		const onInternalEvent = (data: GlobalEvents['internal']['payload']) => {
			if (
				(data.type === 'userListMemberAdded' ||
					data.type === 'userListMemberRemoved' ||
					data.type === 'userListMemberUpdated') &&
				data.body.userListId === listId
			) {
				refreshListUsersInBackground();
			}
		};

		const onUserListStream = (data: { type: string; body: unknown }) => {
			ctx.send(data.type, data.body as never);
		};

		const onNote = async (note: Packed<'Note'>) => {
			// メンバー変更の通知より後に届いたノートは、その変更を反映したメンバーで判定する。
			await latestRefresh.catch(() => {});

			const isMe = user.id === note.userId;

			if (note.channelId) {
				return;
			}

			if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) {
				return;
			}

			if (!Object.hasOwn(membershipsMap, note.userId)) {
				return;
			}

			if (!isNoteVisibleForMeForStream(ctx, note)) {
				return;
			}

			if (note.reply) {
				const reply = note.reply;
				if (membershipsMap[note.userId]?.withReplies) {
					// withReplies で返信を含めても、返信先の followers 公開範囲は越えない。
					if (reply.visibility === 'followers' && !Object.hasOwn(ctx.following, reply.userId)) {
						return;
					}
				} else {
					// withReplies 無効時も、自分宛て・自分の返信・投稿者の自己返信は含める。
					if (reply.userId !== user.id && !isMe && reply.userId !== note.userId) {
						return;
					}
				}
			}

			if (isRenotePacked(note) && !isQuotePacked(note) && !withRenotes) {
				return;
			}

			if (isNoteMutedOrBlockedForStream(ctx, note)) {
				return;
			}

			await sendNoteToStream(deps, ctx, note);
		};

		ctx.subscriber.on(`userListStream:${listId}`, onUserListStream);
		ctx.subscriber.on('notesStream', onNote);
		ctx.subscriber.on('internal', onInternalEvent);

		await refreshListUsers();
		// 通知を出さない経路 (利用者の削除による連鎖削除、リストのインポートなど) の変更は周期的な読み直しで反映する。
		const listUsersClock = setInterval(refreshListUsersInBackground, 5000);

		return {
			dispose: () => {
				ctx.subscriber.off(`userListStream:${listId}`, onUserListStream);
				ctx.subscriber.off('notesStream', onNote);
				ctx.subscriber.off('internal', onInternalEvent);
				clearInterval(listUsersClock);
			},
		};
	},
};
