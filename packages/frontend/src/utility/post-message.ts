/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const postMessageEventTypes = ['misskey:shareForm:shareCompleted'] as const;

export type PostMessageEventType = (typeof postMessageEventTypes)[number];

export function postMessageToParentWindow(type: PostMessageEventType, payload?: any): void {
	window.parent.postMessage(
		{
			type,
			payload,
		},
		'*',
	);
}
