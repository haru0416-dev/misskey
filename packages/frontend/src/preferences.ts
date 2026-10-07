/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StorageProvider } from '@/preferences/store.js';
import { createPreferencesStore, preferencesEvents } from '@/preferences/store.js';
import { store } from '@/store.js';
import { $i } from '@/i.js';
import { TAB_ID } from '@/tab-id.js';
import { DeferredTaskScheduler } from '@/utility/deferred-task-scheduler.js';
import { pinia } from '@/store/pinia.js';
import {
	createLocalPreferencesStorage,
	preferencesActiveStorageKey,
	preferencesStoragePrefix,
} from '@/preferences/storage.js';
import { createCloudPreferencesStorage } from '@/preferences/cloud.js';
import { miLocalStorage } from '@/local-storage.js';
import { isAccountWithToken } from '@/features/auth/account-data.js';

const account = $i == null ? null : { id: $i.id, token: $i.token };

export function isPreferencesAccountCurrent(): boolean {
	const selected = miLocalStorage.getItemAsJson('account', isAccountWithToken);
	return (selected?.id ?? null) === (account?.id ?? null) && (selected?.token ?? null) === (account?.token ?? null);
}

const localPreferencesStorage = createLocalPreferencesStorage(localStorage);
let disposed = false;

const cloudStorage = createCloudPreferencesStorage(account?.token ?? null);
const io: StorageProvider = {
	...localPreferencesStorage,
	...cloudStorage,
	isCurrent: () => isPreferencesAccountCurrent() && localPreferencesStorage.isCurrent(),
	save: (ctx) => {
		if (!isPreferencesAccountCurrent()) throw new Error('Preferences account is no longer selected');
		return localPreferencesStorage.save(ctx);
	},
	replace: (profile) => {
		if (!isPreferencesAccountCurrent()) throw new Error('Preferences account is no longer selected');
		return localPreferencesStorage.replace(profile);
	},
	cloudGet: (ctx) => {
		if (!isPreferencesAccountCurrent()) throw new Error('Preferences account is no longer selected');
		return cloudStorage.cloudGet(ctx);
	},
	cloudGetBulk: (ctx) => {
		if (!isPreferencesAccountCurrent()) throw new Error('Preferences account is no longer selected');
		return cloudStorage.cloudGetBulk(ctx);
	},
	cloudSet: (ctx) => {
		if (!isPreferencesAccountCurrent()) throw new Error('Preferences account is no longer selected');
		return cloudStorage.cloudSet(ctx);
	},
};

export const prefer = createPreferencesStore(io, account, pinia);

//#region タブ間同期
type PreferencesChannelMessage = {
	type: 'preferencesUpdate';
	tabId: string;
};

const preferencesChannel = new BroadcastChannel('preferences');

function notifyPreferencesSaved() {
	if (!disposed) preferencesChannel.postMessage({ type: 'preferencesUpdate', tabId: TAB_ID });
}

function reloadPreferences() {
	if (!disposed && isPreferencesAccountCurrent() && localStorage.getItem(preferencesActiveStorageKey) != null)
		prefer.reloadProfile();
}

function receivePreferencesUpdate(ev: MessageEvent<PreferencesChannelMessage>) {
	if (ev.data.type === 'preferencesUpdate' && ev.data.tabId !== TAB_ID) reloadPreferences();
}

function receivePreferencesStorage(ev: StorageEvent) {
	const active = localStorage.getItem(preferencesActiveStorageKey);
	if (
		ev.key === preferencesActiveStorageKey ||
		(active != null && ev.key?.startsWith(`${preferencesStoragePrefix}${active}:`))
	) {
		reloadPreferences();
	}
}

function resumePreferences() {
	if (document.visibilityState === 'visible') reloadPreferences();
}

preferencesEvents.on('saved', notifyPreferencesSaved);
preferencesChannel.addEventListener('message', receivePreferencesUpdate);
window.addEventListener('storage', receivePreferencesStorage);
document.addEventListener('visibilitychange', resumePreferences);
window.addEventListener('pageshow', reloadPreferences);
//#endregion

//#region 遅延クラウドバックアップ
let latestBackupAt = 0;
let backupJob: Promise<void> | null = null;
const backupScheduler = new DeferredTaskScheduler(
	async () => {
		if (disposed || !isPreferencesAccountCurrent()) return;
		if ($i == null) {
			return;
		}
		if (!store.enablePreferencesAutoCloudBackup) {
			return;
		}
		if (prefer.profile.modifiedAt <= latestBackupAt) {
			return;
		}

		const backedUpModifiedAt = prefer.profile.modifiedAt;
		try {
			// utility.ts は prefer を使うので、静的に import すると循環する。バックアップする時点で読み込む。
			const { cloudBackup } = await import('@/preferences/utility.js');
			if (disposed || !isPreferencesAccountCurrent()) return;
			backupJob = cloudBackup();
			await backupJob;
			latestBackupAt = Math.max(latestBackupAt, backedUpModifiedAt);
		} catch (error) {
			console.error('Automatic preferences backup failed', error);
			if (!disposed && isPreferencesAccountCurrent() && store.enablePreferencesAutoCloudBackup) {
				backupScheduler.request();
			}
		} finally {
			backupJob = null;
		}
	},
	1000 * 60 * 3,
);

function requestBackup(): void {
	if (disposed || !isPreferencesAccountCurrent()) return;
	if ($i == null) {
		return;
	}
	if (!store.enablePreferencesAutoCloudBackup) {
		return;
	}
	backupScheduler.request();
}

preferencesEvents.on('saved', requestBackup);
void store.$persistReady.then(requestBackup);
//#endregion

export async function disposePreferences(): Promise<void> {
	disposed = true;
	preferencesEvents.off('saved', notifyPreferencesSaved);
	preferencesEvents.off('saved', requestBackup);
	preferencesChannel.removeEventListener('message', receivePreferencesUpdate);
	preferencesChannel.close();
	window.removeEventListener('storage', receivePreferencesStorage);
	document.removeEventListener('visibilitychange', resumePreferences);
	window.removeEventListener('pageshow', reloadPreferences);
	backupScheduler.dispose();
	const [preferencesStopped] = await Promise.allSettled([prefer.$preferencesDispose(), backupJob]);
	if (preferencesStopped.status === 'rejected') throw preferencesStopped.reason;
}

if (_DEV_) {
	Object.assign(window, {
		prefer,
		cloudBackup: async () => (await import('@/preferences/utility.js')).cloudBackup(),
	});
}
