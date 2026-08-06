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

	// There is a possibility that replyId is not null but reply is null when the reply note is deleted.
	public reply: MiNote | null;

	public renoteId: MiNote['id'] | null;

	// There is a possibility that renoteId is not null but renote is null when the renote note is deleted.
	public renote: MiNote | null;

	// TODO: varcharにしたい(Note.tsと同じ)
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

	// There is a possibility that channelId is not null but channel is null when the channel is deleted.
	// (deleting channel is not implemented so it's not happening now but may happen in the future)
	public channel: MiChannel | null;

	public hasPoll: boolean;

	public pollChoices: string[];

	public pollMultiple: boolean;

	public pollExpiresAt: Date | null;

	public pollExpiredAfter: number | null;

	// 予約日時
	// これがあるだけでは実際に予約されているかどうかはわからない
	public scheduledAt: Date | null;

	// scheduledAtに基づいて実際にスケジュールされているか
	public isActuallyScheduled: boolean;
}
