/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { followingVisibilities, followersVisibilities, notificationTypes } from '@/types.js';
import { MiUser } from './User.js';
import { MiPage } from './Page.js';
import { MiUserList } from './UserList.js';

// TODO: このテーブルで管理している情報すべてレジストリで管理するようにしても良いかも
//       ただ、「emailVerified が true なユーザーを find する」のようなクエリは書けなくなるからウーン
export class MiUserProfile {
	public userId: MiUser['id'];

	public user: MiUser | null;

	public location: string | null;

	// Note: There's index named IDX_de22cd2b445eee31ae51cdbe99 for SUBSTR("birthday", 6, 5)
	public birthday: string | null;

	public description: string | null;

	// フォローされた際のメッセージ
	public followedMessage: string | null;

	// TODO: 鍵アカウントの場合の、フォローリクエスト受信時のメッセージも設定できるようにする

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
		name: (typeof ACHIEVEMENT_TYPES)[number];
		unlockedAt: number;
	}[];

	public userHost: string | null;

	constructor(data: Partial<MiUserProfile>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}

export const ACHIEVEMENT_TYPES = [
	'notes1',
	'notes10',
	'notes100',
	'notes500',
	'notes1000',
	'notes5000',
	'notes10000',
	'notes20000',
	'notes30000',
	'notes40000',
	'notes50000',
	'notes60000',
	'notes70000',
	'notes80000',
	'notes90000',
	'notes100000',
	'login3',
	'login7',
	'login15',
	'login30',
	'login60',
	'login100',
	'login200',
	'login300',
	'login400',
	'login500',
	'login600',
	'login700',
	'login800',
	'login900',
	'login1000',
	'passedSinceAccountCreated1',
	'passedSinceAccountCreated2',
	'passedSinceAccountCreated3',
	'loggedInOnBirthday',
	'loggedInOnNewYearsDay',
	'noteClipped1',
	'noteFavorited1',
	'myNoteFavorited1',
	'profileFilled',
	'markedAsCat',
	'following1',
	'following10',
	'following50',
	'following100',
	'following300',
	'followers1',
	'followers10',
	'followers50',
	'followers100',
	'followers300',
	'followers500',
	'followers1000',
	'collectAchievements30',
	'viewAchievements3min',
	'iLoveMisskey',
	'foundTreasure',
	'client30min',
	'client60min',
	'noteDeletedWithin1min',
	'postedAtLateNight',
	'postedAt0min0sec',
	'selfQuote',
	'htl20npm',
	'viewInstanceChart',
	'outputHelloWorldOnScratchpad',
	'open3windows',
	'driveFolderCircularReference',
	'reactWithoutRead',
	'clickedClickHere',
	'justPlainLucky',
	'setNameToSyuilo',
	'brainDiver',
	'smashTestNotificationButton',
	'tutorialCompleted',
] as const;
