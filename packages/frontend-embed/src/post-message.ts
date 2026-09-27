/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type PostMessageEventType = 'misskey:embed:ready' | 'misskey:embed:changeHeight';

export interface PostMessageEventPayload extends Record<PostMessageEventType, unknown> {
	'misskey:embed:ready': undefined;
	'misskey:embed:changeHeight': {
		height: number;
	};
}

let defaultIframeId: string | null = null;

export function setIframeId(id: string): void {
	if (defaultIframeId != null) {
		return;
	}

	if (_DEV_) {
		console.log('setIframeId', id);
	}
	defaultIframeId = id;
}

export function postMessageToParentWindow<T extends PostMessageEventType = PostMessageEventType>(
	type: T,
	payload?: PostMessageEventPayload[T],
	iframeId: string | null = null,
): void {
	let _iframeId = iframeId;
	if (_iframeId == null) {
		_iframeId = defaultIframeId;
	}
	if (_DEV_) {
		console.log('postMessageToParentWindow', type, _iframeId, payload);
	}
	// embed先のoriginは事前に特定できない。機密情報は送らず、受信側がevent.sourceをiframeと照合する。
	window.parent.postMessage(
		{
			type,
			iframeId: _iframeId,
			payload,
		},
		'*',
	);
}
