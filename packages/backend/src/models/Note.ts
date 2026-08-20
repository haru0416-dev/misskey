/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { noteVisibilities, noteReactionAcceptances } from '@/types.js';
import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';
import type { MiDriveFile } from './DriveFile.js';

// 大規模なテーブルの既存カラムに索引を追加する場合は、必要に応じて同時作成できる新しい migration にする。

export class MiNote {
	public id: string;

	public replyId: MiNote['id'] | null;

	public reply: MiNote | null;

	public renoteId: MiNote['id'] | null;

	public renote: MiNote | null;

	public threadId: string | null;

	public text: string | null;

	public name: string | null;

	public cw: string | null;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public localOnly: boolean;

	public reactionAcceptance: (typeof noteReactionAcceptances)[number] | null;

	public renoteCount: number;

	public repliesCount: number;

	public clippedCount: number;

	// このノートを参照する Pages ブロック数。リモートノート削除処理が手動で更新し、trigger では更新しない。
	public pageCount: number;

	public reactions: Record<string, number>;

	/**
	 * public ... 公開
	 * home ... ホームタイムライン(ユーザーページのタイムライン含む)のみに流す
	 * followers ... フォロワーのみ
	 * specified ... visibleUserIds で指定したユーザーのみ
	 */
	public visibility: (typeof noteVisibilities)[number];

	public uri: string | null;

	public url: string | null;

	public fileIds: MiDriveFile['id'][];

	public attachedFileTypes: string[];

	public visibleUserIds: MiUser['id'][];

	public mentions: MiUser['id'][];

	public mentionedRemoteUsers: string;

	public reactionAndUserPairCache: string[];

	public emojis: string[];

	public tags: string[];

	public hasPoll: boolean;

	public channelId: MiChannel['id'] | null;

	public channel: MiChannel | null;

	public userHost: string | null;

	public replyUserId: MiUser['id'] | null;

	public replyUserHost: string | null;

	public renoteUserId: MiUser['id'] | null;

	public renoteUserHost: string | null;

	public renoteChannelId: MiChannel['id'] | null;

	constructor(data: Partial<MiNote>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}

export type IMentionedRemoteUsers = {
	uri: string;
	url?: string;
	username: string;
	host: string;
}[];
