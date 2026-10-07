/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const bytes = crypto.getRandomValues(new Uint8Array(16));
let tabId = '';
for (const byte of bytes) tabId += byte.toString(16).padStart(2, '0');
export const TAB_ID = tabId;
if (_DEV_) {
	console.log('TAB_ID', TAB_ID);
}
