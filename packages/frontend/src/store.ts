/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineStore } from 'pinia';
import * as Misskey from 'misskey-js';
import type { StateTree } from 'pinia';
import type { Cloneable } from '@/utility/clone.js';
import type { TIPS } from '@/tips.js';
import type { PersistedStateDefinition } from '@/store/persisted-state.js';
import { deepClone } from '@/utility/clone.js';
import { attachPersistedState } from '@/store/persisted-state.js';
import { persistedStateIo } from '@/store/persisted-state-io.js';
import { pinia } from '@/store/pinia.js';

function createBaseState() {
	return {
		accountSetupWizard: 0,
		tips: {} as Partial<Record<(typeof TIPS)[number], boolean>>, // true = 既読
		memo: null as string | null,
		reactionAcceptance: 'nonSensitiveOnly' as
			| 'likeOnly'
			| 'likeOnlyForRemote'
			| 'nonSensitiveOnly'
			| 'nonSensitiveOnlyForLocalLikeOnlyForRemote'
			| null,
		mutedAds: [] as string[],
		visibility: 'public' as (typeof Misskey.noteVisibilities)[number],
		localOnly: false,
		showPreview: false,
		tl: {
			src: 'home' as 'home' | 'local' | 'social' | 'global' | `list:${string}`,
			userList: null as Misskey.entities.UserList | null,
			filter: {
				withReplies: true,
				withRenotes: true,
				withSensitive: true,
				onlyFiles: false,
			},
		},
		darkMode: false,
		realtimeMode: true,
		recentlyUsedEmojis: [] as string[],
		recentlyUsedUsers: [] as string[],
		menuDisplay: 'sideFull' as 'sideFull' | 'sideIcon',
		postFormWithHashtags: false,
		postFormHashtags: '',
		additionalUnicodeEmojiIndexes: {} as Record<string, Record<string, string[]>>,
		pluginTokens: {} as Record<string, string>, // plugin id, token
		accountTokens: {} as Record<string, string>, // host/userId, token
		accountInfos: {} as Record<string, Misskey.entities.MeDetailed>, // host/userId, user
		enablePreferencesAutoCloudBackup: false,
		showPreferencesAutoCloudBackupSuggestion: true,
		showStoragePersistenceSuggestion: true,
	};
}

export type BaseState = ReturnType<typeof createBaseState>;

const basePersistedState = {
	namespace: 'base',
	properties: {
		accountSetupWizard: { where: 'account' },
		tips: { where: 'device' },
		memo: { where: 'account' },
		reactionAcceptance: { where: 'account' },
		mutedAds: { where: 'account' },
		visibility: { where: 'deviceAccount' },
		localOnly: { where: 'deviceAccount' },
		showPreview: { where: 'device' },
		tl: { where: 'deviceAccount' },
		darkMode: { where: 'device' },
		realtimeMode: { where: 'device' },
		recentlyUsedEmojis: { where: 'device' },
		recentlyUsedUsers: { where: 'device' },
		menuDisplay: { where: 'device' },
		postFormWithHashtags: { where: 'device' },
		postFormHashtags: { where: 'device' },
		additionalUnicodeEmojiIndexes: { where: 'device' },
		pluginTokens: { where: 'deviceAccount' },
		accountTokens: { where: 'device' },
		accountInfos: { where: 'device' },
		enablePreferencesAutoCloudBackup: { where: 'device' },
		showPreferencesAutoCloudBackupSuggestion: { where: 'device' },
		showStoragePersistenceSuggestion: { where: 'device' },
	},
} satisfies PersistedStateDefinition<BaseState>;

export const useBaseStore = defineStore('base', {
	state: createBaseState,
	persist: basePersistedState,
	actions: {
		set<K extends keyof BaseState>(key: K, value: BaseState[K]): Promise<void> {
			this.$patch({ [key]: deepClone(value as Cloneable) as BaseState[K] });
			return this.$persistFlush();
		},
		reset<K extends keyof BaseState>(key: K): Promise<void> {
			return this.set(key, createBaseState()[key]);
		},
	},
});

const baseStore = useBaseStore(pinia);
Object.assign(
	baseStore,
	attachPersistedState(baseStore, basePersistedState as PersistedStateDefinition<StateTree>, persistedStateIo),
);

export const store = baseStore;
