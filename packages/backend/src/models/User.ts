/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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

	// avatarId が null になったとしてもこれが null でない可能性があるため、このフィールドを使うときは avatarId の non-null チェックをすること
	public avatarUrl: string | null;

	// bannerId が null になったとしてもこれが null でない可能性があるため、このフィールドを使うときは bannerId の non-null チェックをすること
	public bannerUrl: string | null;

	// avatarId が null になったとしてもこれが null でない可能性があるため、このフィールドを使うときは avatarId の non-null チェックをすること
	public avatarBlurhash: string | null;

	// bannerId が null になったとしてもこれが null でない可能性があるため、このフィールドを使うときは bannerId の non-null チェックをすること
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

	public isLocked: boolean;

	public isBot: boolean;

	public isCat: boolean;

	public isExplorable: boolean;

	public isHibernated: boolean;

	public requireSigninToViewContents: boolean;

	// in sec, マイナスで相対時間
	public makeNotesFollowersOnlyBefore: number | null;

	// in sec, マイナスで相対時間
	public makeNotesHiddenBefore: number | null;

	// アカウントが削除されたかどうかのフラグだが、完全に削除される際は物理削除なので実質削除されるまでの「削除が進行しているかどうか」のフラグ
	public isDeleted: boolean;

	public emojis: string[];

	// チャットを許可する相手
	// everyone: 誰からでも
	// followers: フォロワーのみ
	// following: フォローしているユーザーのみ
	// mutual: 相互フォローのみ
	// none: 誰からも受け付けない
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
			(this as any)[k] = v;
		}
	}
}

export type MiLocalUser = MiUser & {
	host: null;
	uri: null;
};

export type MiPartialLocalUser = Partial<MiUser> & {
	id: MiUser['id'];
	host: null;
	uri: null;
};

export type MiRemoteUser = MiUser & {
	host: string;
	uri: string;
};

export type MiPartialRemoteUser = Partial<MiUser> & {
	id: MiUser['id'];
	host: string;
	uri: string;
};

export const localUsernameSchema = { type: 'string', pattern: /^\w{1,20}$/.toString().slice(1, -1) } as const;
export const passwordSchema = { type: 'string', minLength: 1 } as const;
export const nameSchema = { type: 'string', minLength: 1, maxLength: 50 } as const;
export const descriptionSchema = { type: 'string', minLength: 1, maxLength: 1500 } as const;
export const followedMessageSchema = { type: 'string', minLength: 1, maxLength: 256 } as const;
export const locationSchema = { type: 'string', minLength: 1, maxLength: 50 } as const;
export const birthdaySchema = { type: 'string', pattern: /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.toString().slice(1, -1) } as const;
