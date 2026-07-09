/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const reloadChannel = new BroadcastChannel('reload');

// BroadcastChannelを用いて、クライアントが一斉にreloadするようにします。
export function unisonReload(path?: string) {
	if (path !== undefined) {
		reloadChannel.postMessage(path);
		window.location.href = path;
	} else {
		reloadChannel.postMessage(null);
		window.location.reload();
	}
}
