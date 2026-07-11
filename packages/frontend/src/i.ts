/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import { miLocalStorage } from '@/local-storage.js';
import { isAccountWithToken } from '@/utility/account-data.js';
import type { AccountWithToken } from '@/utility/account-data.js';

// TODO: 他のタブと永続化されたstateを同期

export type { AccountWithToken } from '@/utility/account-data.js';

const accountData = miLocalStorage.getItemAsJson('account', isAccountWithToken);

// TODO: 外部からはreadonlyに
export const $i = accountData ? reactive<AccountWithToken>(accountData) : null;

export const iAmModerator = $i != null && ($i.isAdmin === true || $i.isModerator === true);
export const iAmAdmin = $i != null && $i.isAdmin;

export function ensureSignin() {
	if ($i == null) throw new Error('signin required');
	return $i;
}

export let notesCount = $i == null ? 0 : $i.notesCount;
export function incNotesCount() {
	notesCount++;
}

if (_DEV_) {
	(window as any).$i = $i;
}
