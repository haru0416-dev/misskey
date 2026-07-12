/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const DISALLOWED_CALLBACK_PROTOCOLS = new Set([
	'about:',
	'blob:',
	'chrome:',
	'data:',
	'file:',
	'ftp:',
	'intent:',
	'javascript:',
	'mailto:',
	'resource:',
	'tel:',
	'vbscript:',
]);

export function createAuthCallbackUrl(callbackUrl: string, token: string): string {
	const url = new URL(callbackUrl);
	if (DISALLOWED_CALLBACK_PROTOCOLS.has(url.protocol)) throw new Error('invalid url');
	url.searchParams.set('token', token);
	return url.toString();
}
