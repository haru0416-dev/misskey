/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const reloadChannel = new BroadcastChannel('reload');

// BroadcastChannel で他のタブにも同時に reload させる。
export function unisonReload(path?: string) {
	if (path !== undefined) {
		reloadChannel.postMessage(path);
		window.location.href = path;
	} else {
		reloadChannel.postMessage(null);
		window.location.reload();
	}
}
