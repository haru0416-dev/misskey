/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { noteVisibilities, noteReactionAcceptances } from '@/types.js';
import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';
import { MiNote } from './Note.js';
import type { MiDriveFile } from './DriveFile.js';

export class MiNoteDraft {
	public id: string;

	public replyId: MiNote['id'] | null;

	// 返信先ノートが削除されると、replyId が null でなくても reply は null になり得る。
	public reply: MiNote | null;

	public renoteId: MiNote['id'] | null;

	// リノート先ノートが削除されると、renoteId が null でなくても renote は null になり得る。
	public renote: MiNote | null;

	public text: string | null;

	public cw: string | null;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public localOnly: boolean;

	public reactionAcceptance: (typeof noteReactionAcceptances)[number];

	/**
	 * public ... 公開
	 * home ... ホームタイムライン(ユーザーページのタイムライン含む)のみに流す
	 * followers ... フォロワーのみ
	 * specified ... visibleUserIds で指定したユーザーのみ
	 */
	public visibility: (typeof noteVisibilities)[number];

	public fileIds: MiDriveFile['id'][];

	public visibleUserIds: MiUser['id'][];

	public hashtag: string | null;

	public channelId: MiChannel['id'] | null;

	// チャンネルが削除されると、channelId が null でなくても channel は null になり得る。
	public channel: MiChannel | null;

	public hasPoll: boolean;

	public pollChoices: string[];

	public pollMultiple: boolean;

	public pollExpiresAt: Date | null;

	public pollExpiredAfter: number | null;

	public scheduledAt: Date | null;

	// scheduledAt だけでは予約状態を判定できないため、実状態を別に保持する。
	public isActuallyScheduled: boolean;
}
