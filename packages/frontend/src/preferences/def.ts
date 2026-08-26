/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { hemisphere } from '@shared/utility/intl-const.js';
import { DEFAULT_EMOJIS } from '@shared/utility/const.js';
import { prefersReducedMotion } from '@shared/utility/config.js';
import { definePreferences } from './store.js';
import type { Theme } from '@shared/utility/theme.js';
import type { SoundType } from '@/features/sound/sound.js';
import type { Plugin } from '@/plugin.js';
import type { DeviceKind } from '@/utility/device-kind.js';
import type { DeckProfile } from '@/deck.js';
import type { WatermarkPreset } from '@/features/image-editor/watermark/WatermarkRenderer.js';
import type { ImageFramePreset } from '@/features/image-editor/frame/ImageFrameRenderer.js';
import { genId } from '@/utility/id.js';
import { deviceKind } from '@/utility/device-kind.js';
import { deepEqual } from '@/utility/deep-equal.js';
import type { SearchEngine } from '@/features/search/search-engine.js';

/** サウンド設定 */
export type SoundStore =
	| {
			type: Exclude<SoundType, '_driveFile_'>;
			volume: number;
	  }
	| {
			type: '_driveFile_';

			/** ドライブのファイルID */
			fileId: string;

			/** ファイルURL（こちらが優先される） */
			fileUrl: string;

			volume: number;
	  };

export type StatusbarStore = {
	name: string | null;
	id: string;
	type: string | null;
	size: 'verySmall' | 'small' | 'medium' | 'large' | 'veryLarge';
	black: boolean;
	// 各設定画面とレンダラーが個別のキーを直接扱うため、props は具体化しない。
	props: Record<string, any>;
};

export type DataSaverStore = {
	media: boolean;
	avatar: boolean;
	urlPreviewThumbnail: boolean;
	disableUrlPreview: boolean;
	code: boolean;
};

type OmitStrict<T, K extends keyof T> = T extends unknown ? Pick<T, Exclude<keyof T, K>> : never;

function mergeItemsById<T extends { id: string }>(a: T[], b: T[]): T[] {
	const mergedItems: T[] = [];
	const itemsById = new Map<string, T>();
	for (const item of [...a, ...b]) {
		const existing = itemsById.get(item.id);
		if (existing == null) {
			itemsById.set(item.id, item);
			mergedItems.push(item);
		} else if (
			!deepEqual(
				item as unknown as Parameters<typeof deepEqual>[0],
				existing as unknown as Parameters<typeof deepEqual>[1],
			)
		) {
			throw new Error();
		}
	}
	return mergedItems;
}

// デフォルト値は他の設定に依存させない。設定単体のリセット時にも同じ値を使う必要がある。

export const PREF_DEF = definePreferences({
	accounts: {
		default: [] as [
			host: string,
			user: {
				id: string;
				username: string;
			},
		][],
	},

	pinnedUserLists: {
		accountDependent: true,
		default: [] as Misskey.entities.UserList[],
	},
	uploadFolder: {
		accountDependent: true,
		default: null as string | null,
	},
	widgets: {
		accountDependent: true,
		default: () =>
			[
				{
					name: 'calendar',
					id: genId(),
					place: 'right',
					data: {},
				},
				{
					name: 'notifications',
					id: genId(),
					place: 'right',
					data: {},
				},
				{
					name: 'trends',
					id: genId(),
					place: 'right',
					data: {},
				},
			] as {
				name: string;
				id: string;
				place: string | null;
				// ウィジェットごとにデータ形状が異なり、フォーム値との相互変換が設定値の union 型にも波及するため、data は具体化しない。
				data: Record<string, any>;
			}[],
	},
	'deck.profile': {
		accountDependent: true,
		default: null as string | null,
	},
	'deck.profiles': {
		accountDependent: true,
		default: [] as DeckProfile[],
	},

	emojiPalettes: {
		serverDependent: true,
		default: () =>
			[
				{
					id: genId(),
					name: '',
					emojis: DEFAULT_EMOJIS,
				},
			] as {
				id: string;
				name: string;
				emojis: string[];
			}[],
		mergeStrategy: mergeItemsById,
	},
	emojiPaletteForReaction: {
		serverDependent: true,
		default: null as string | null,
	},
	emojiPaletteForMain: {
		serverDependent: true,
		default: null as string | null,
	},

	overridedDeviceKind: {
		default: null as DeviceKind | null,
	},
	searchEngine: {
		default: 'google' as SearchEngine,
	},
	themes: {
		default: [] as Theme[],
		mergeStrategy: mergeItemsById,
	},
	lightTheme: {
		default: null as Theme | null,
	},
	darkTheme: {
		default: null as Theme | null,
	},
	syncDeviceDarkMode: {
		default: true,
	},
	defaultNoteVisibility: {
		default: 'public' as (typeof Misskey.noteVisibilities)[number],
	},
	defaultNoteLocalOnly: {
		default: false,
	},
	keepCw: {
		default: true,
	},
	rememberNoteVisibility: {
		default: false,
	},
	reportError: {
		default: false,
	},
	collapseRenotes: {
		default: true,
	},
	menu: {
		default: [
			'notifications',
			'clips',
			'drive',
			'followRequests',
			'chat',
			'-',
			'explore',
			'announcements',
			'channels',
			'search',
			'-',
			'quickSettings',
			'ui',
		],
	},
	statusbars: {
		default: [] as StatusbarStore[],
	},
	serverDisconnectedBehavior: {
		default: 'quiet' as 'quiet' | 'reload' | 'dialog',
	},
	nsfw: {
		default: 'respect' as 'respect' | 'force' | 'ignore',
	},
	highlightSensitiveMedia: {
		default: false,
	},
	animation: {
		default: !prefersReducedMotion,
	},
	animatedMfm: {
		default: !prefersReducedMotion,
	},
	advancedMfm: {
		default: true,
	},
	showReactionsCount: {
		default: false,
	},
	enableQuickAddMfmFunction: {
		default: false,
	},
	loadRawImages: {
		default: false,
	},
	imageNewTab: {
		default: false,
	},
	disableShowingAnimatedImages: {
		default: false,
	},
	emojiStyle: {
		default: 'twemoji' as 'native' | 'fluentEmoji' | 'twemoji',
	},
	menuStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	useBlurEffectForModal: {
		default: true,
	},
	useBlurEffect: {
		default: true,
	},
	useStickyIcons: {
		default: true,
	},
	enableHighQualityImagePlaceholders: {
		default: true,
	},
	showFixedPostForm: {
		default: false,
	},
	showFixedPostFormInChannel: {
		default: false,
	},
	draftRestoreMode: {
		default: 'always' as 'always' | 'ask' | 'never',
	},
	enableInfiniteScroll: {
		default: true,
	},
	useReactionPickerForContextMenu: {
		default: false,
	},
	instanceTicker: {
		default: 'remote' as 'none' | 'remote' | 'always',
	},
	instanceTickerDisplay: {
		default: 'normal' as 'normal' | 'compact' | 'icon',
	},
	emojiPickerScale: {
		default: 2,
	},
	emojiPickerWidth: {
		default: 2,
	},
	emojiPickerHeight: {
		default: 3,
	},
	emojiPickerStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	squareAvatars: {
		default: false,
	},
	showAvatarDecorations: {
		default: true,
	},
	numberOfPageCache: {
		default: 3,
	},
	pollingInterval: {
		// 1 ... 低
		// 2 ... 中
		// 3 ... 高
		default: 2,
	},
	showNoteActionsOnlyHover: {
		default: false,
	},
	showClipButtonInNoteFooter: {
		default: false,
	},
	reactionsDisplaySize: {
		default: 'medium' as 'small' | 'medium' | 'large',
	},
	limitWidthOfReaction: {
		default: true,
	},
	forceShowAds: {
		default: false,
	},
	aiChanMode: {
		default: false,
	},
	devMode: {
		default: false,
	},
	mediaListWithOneImageAppearance: {
		default: 'expand' as 'expand' | '16_9' | '1_1' | '2_3',
	},
	showMediaListByGridInWideArea: {
		default: false,
	},
	notificationPosition: {
		default: 'rightBottom' as 'leftTop' | 'leftBottom' | 'rightTop' | 'rightBottom',
	},
	notificationStackAxis: {
		default: 'horizontal' as 'vertical' | 'horizontal',
	},
	enableCondensedLine: {
		default: true,
	},
	keepScreenOn: {
		default: false,
	},
	useGroupedNotifications: {
		default: true,
	},
	dataSaver: {
		default: {
			media: false,
			avatar: false,
			urlPreviewThumbnail: false,
			disableUrlPreview: false,
			code: false,
		} as DataSaverStore,
	},
	hemisphere: {
		default: hemisphere as 'N' | 'S',
	},
	enableSeasonalScreenEffect: {
		default: false,
	},
	enableHorizontalSwipe: {
		default: false,
	},
	enablePullToRefresh: {
		default: true,
	},
	useNativeUiForVideoAudioPlayer: {
		default: false,
	},
	keepOriginalFilename: {
		default: true,
	},
	alwaysConfirmFollow: {
		default: true,
	},
	confirmWhenRevealingSensitiveMedia: {
		default: false,
	},
	contextMenu: {
		default: 'app' as 'app' | 'appWithShift' | 'native',
	},
	skipNoteRender: {
		default: true,
	},
	showSoftWordMutedWord: {
		default: false,
	},
	confirmOnReact: {
		default: false,
	},
	defaultFollowWithReplies: {
		default: false,
	},
	makeEveryTextElementsSelectable: {
		default: deviceKind === 'desktop',
	},
	showNavbarSubButtons: {
		default: true,
	},
	showTitlebar: {
		default: false,
	},
	showAvailableReactionsFirstInNote: {
		default: false,
	},
	showPageTabBarBottom: {
		default: false,
	},
	plugins: {
		// プラグインごとに config のスキーマが異なり、plugin.ts と設定画面が Plugin['config'] として直接扱うため、config は具体化しない。
		default: [] as (OmitStrict<Plugin, 'config'> & { config: Record<string, any> })[],
		mergeStrategy: (a, b) => {
			const installIds = new Set(a.map((plugin) => plugin.installId));
			const names = new Set(a.map((plugin) => plugin.name));
			if (b.some((plugin) => installIds.has(plugin.installId) || names.has(plugin.name))) throw new Error();
			return a.concat(b);
		},
	},
	mutingEmojis: {
		default: [] as string[],
		mergeStrategy: (a, b) => {
			return [...new Set(a.concat(b))];
		},
	},
	watermarkPresets: {
		accountDependent: true,
		default: [] as WatermarkPreset[],
		mergeStrategy: mergeItemsById,
	},
	defaultWatermarkPresetId: {
		accountDependent: true,
		default: null as WatermarkPreset['id'] | null,
	},
	imageFramePresets: {
		accountDependent: true,
		default: [] as ImageFramePreset[],
		mergeStrategy: mergeItemsById,
	},
	defaultImageCompressionLevel: {
		default: 2 as 0 | 1 | 2 | 3,
	},
	defaultVideoCompressionLevel: {
		default: 2 as 0 | 1 | 2 | 3,
	},

	'sound.masterVolume': {
		default: 0.5,
	},
	'sound.notUseSound': {
		default: false,
	},
	'sound.useSoundOnlyWhenActive': {
		default: false,
	},
	'sound.on.note': {
		default: { type: 'syuilo/n-aec', volume: 1 } as SoundStore,
	},
	'sound.on.noteMy': {
		default: { type: 'syuilo/n-cea-4va', volume: 1 } as SoundStore,
	},
	'sound.on.notification': {
		default: { type: 'syuilo/n-ea', volume: 1 } as SoundStore,
	},
	'sound.on.reaction': {
		default: { type: 'syuilo/bubble2', volume: 1 } as SoundStore,
	},
	'sound.on.chatMessage': {
		default: { type: 'syuilo/waon', volume: 1 } as SoundStore,
	},

	'deck.alwaysShowMainColumn': {
		default: true,
	},
	'deck.navWindow': {
		default: true,
	},
	'deck.useSimpleUiForNonRootPages': {
		default: true,
	},
	'deck.columnAlign': {
		default: 'center' as 'left' | 'center',
	},
	'deck.columnGap': {
		default: 6,
	},
	'deck.menuPosition': {
		default: 'bottom' as 'right' | 'bottom',
	},
	'deck.navbarPosition': {
		default: 'left' as 'left' | 'top' | 'bottom',
	},
	'deck.wallpaper': {
		default: null as string | null,
	},

	'chat.showSenderName': {
		default: false,
	},
	'chat.sendOnEnter': {
		default: false,
	},

	'game.dropAndFusion': {
		default: {
			bgmVolume: 0.25,
			sfxVolume: 1,
		},
	},

	'experimental.stackingRouterView': {
		default: false,
	},
	'experimental.enableFolderPageView': {
		default: false,
	},
	'experimental.enableWebTranslatorApi': {
		default: false,
	},
});
