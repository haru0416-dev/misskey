/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { followingVisibilities, followersVisibilities, notificationTypes } from '@/types.js';
import type { MiUser } from './User.js';
import type { MiPage } from './Page.js';
import type { MiUserList } from './UserList.js';
import type { achievementTypes } from 'misskey-js/consts.js';

export class MiUserProfile {
	public userId: MiUser['id'];

	public user: MiUser | null;

	public location: string | null;

	// 月日検索には IDX_USERPROFILE_BIRTHDAY_DATE を使用する。
	public birthday: string | null;

	public description: string | null;

	public followedMessage: string | null;

	public fields: {
		name: string;
		value: string;
	}[];

	public verifiedLinks: string[];

	public lang: string | null;

	public url: string | null;

	public email: string | null;

	public emailVerifyCode: string | null;

	public emailVerified: boolean;

	public emailNotificationTypes: string[];

	public publicReactions: boolean;

	public followingVisibility: (typeof followingVisibilities)[number];

	public followersVisibility: (typeof followersVisibilities)[number];

	public twoFactorTempSecret: string | null;

	public twoFactorSecret: string | null;

	public twoFactorBackupSecret: string[] | null;

	public twoFactorEnabled: boolean;

	public securityKeysAvailable: boolean;

	public usePasswordLessLogin: boolean;

	public password: string | null;

	public moderationNote: string | null;

	public autoAcceptFollowed: boolean;

	public noCrawle: boolean;

	public preventAiLearning: boolean;

	public alwaysMarkNsfw: boolean;

	public autoSensitive: boolean;

	public carefulBot: boolean;

	public injectFeaturedNote: boolean;

	public receiveAnnouncementEmail: boolean;

	public pinnedPageId: MiPage['id'] | null;

	public pinnedPage: MiPage | null;

	public enableWordMute: boolean;

	public mutedWords: (string[] | string)[];

	public hardMutedWords: (string[] | string)[];

	public mutedInstances: string[];

	public notificationRecieveConfig: {
		[notificationType in (typeof notificationTypes)[number]]?:
			| {
					type: 'all';
			  }
			| {
					type: 'never';
			  }
			| {
					type: 'following';
			  }
			| {
					type: 'follower';
			  }
			| {
					type: 'mutualFollow';
			  }
			| {
					type: 'followingOrFollower';
			  }
			| {
					type: 'list';
					userListId: MiUserList['id'];
			  };
	};

	public loggedInDates: string[];

	public achievements: {
		name: (typeof achievementTypes)[number];
		unlockedAt: number;
	}[];

	public userHost: string | null;

	constructor(data: Partial<MiUserProfile>) {
		if (data == null) {
			return;
		}

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
