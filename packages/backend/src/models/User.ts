/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { MiDriveFile } from './DriveFile.js';

export class MiUser {
	public id: string;

	public updatedAt: Date | null;

	public lastFetchedAt: Date | null;

	public lastActiveDate: Date | null;

	public hideOnlineStatus: boolean;

	public username: string;

	public usernameLower: string;

	public name: string | null;

	public followersCount: number;

	public followingCount: number;

	public movedToUri: string | null;

	public movedAt: Date | null;

	public alsoKnownAs: string[] | null;

	public notesCount: number;

	public avatarId: MiDriveFile['id'] | null;

	public avatar: MiDriveFile | null;

	public bannerId: MiDriveFile['id'] | null;

	public banner: MiDriveFile | null;

	// avatarId が null でも値が残るため、利用時は avatarId も確認する。
	public avatarUrl: string | null;

	// bannerId が null でも値が残るため、利用時は bannerId も確認する。
	public bannerUrl: string | null;

	// avatarId が null でも値が残るため、利用時は avatarId も確認する。
	public avatarBlurhash: string | null;

	// bannerId が null でも値が残るため、利用時は bannerId も確認する。
	public bannerBlurhash: string | null;

	public avatarDecorations: {
		id: string;
		angle?: number;
		flipH?: boolean;
		offsetX?: number;
		offsetY?: number;
	}[];

	public tags: string[];

	public score: number;

	public isSuspended: boolean;

	public suspensionTransitionId: string | null;

	public isLocked: boolean;

	public isBot: boolean;

	public isCat: boolean;

	public isExplorable: boolean;

	public isHibernated: boolean;

	public requireSigninToViewContents: boolean;

	// 秒単位。負値は相対時間を表す。
	public makeNotesFollowersOnlyBefore: number | null;

	// 秒単位。負値は相対時間を表す。
	public makeNotesHiddenBefore: number | null;

	// 物理削除までの進行中状態を表す。
	public isDeleted: boolean;

	public emojis: string[];

	// everyone=全員、followers=フォロワー、following=フォロー中、mutual=相互、none=拒否。
	public chatScope: 'everyone' | 'followers' | 'following' | 'mutual' | 'none';

	public host: string | null;

	public inbox: string | null;

	public sharedInbox: string | null;

	public featured: string | null;

	public uri: string | null;

	public followersUri: string | null;

	public token: string | null;

	constructor(data: Partial<MiUser>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}

export type MiLocalUser = MiUser & {
	host: null;
	uri: null;
};

type MiPartialLocalUser = Partial<MiUser> & {
	id: MiUser['id'];
	host: null;
	uri: null;
};

export type MiRemoteUser = MiUser & {
	host: string;
	uri: string;
};

type MiPartialRemoteUser = Partial<MiUser> & {
	id: MiUser['id'];
	host: string;
	uri: string;
};

export const localUsernameSchema = z.string().regex(/^\w{1,20}$/);
export const passwordSchema = z.string().min(1);
export const nameSchema = z.string().min(1).max(50);
export const descriptionSchema = z.string().min(1).max(1500);
export const followedMessageSchema = z.string().min(1).max(256);
export const locationSchema = z.string().min(1).max(50);

// 追加情報 (fields) は 16 個まで持てるので、1 個あたりを絞らないとプロフィール全体が
// 無制限に膨らむ。名前は見出し相当なので name と同じ 50、値は URL や短文が入るので 512。
export const profileFieldNameSchema = z.string().max(50);
export const profileFieldValueSchema = z.string().max(512);
// 9999-99-99 のような実在しない日付を拒否する。
export const birthdaySchema = z.iso.date();
