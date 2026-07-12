/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function createFetchTelemetryUrlPatterns(
	apiUrl: string,
	configuredUrls: readonly string[] = [],
): { allowed: RegExp; ignored: RegExp } {
	const prefixes = [...new Set([apiUrl, ...configuredUrls].map(normalizeUrlPrefix))];
	const alternatives = prefixes.map((prefix) => `${escapeRegExp(prefix)}(?:[/?#]|$)`).join('|');
	return {
		allowed: new RegExp(`^(?:${alternatives})`),
		ignored: new RegExp(`^(?!(?:${alternatives})).*$`),
	};
}

export function redactTelemetryUrl(value: string): string {
	const url = new URL(value, window.location.origin);
	url.search = '';
	url.hash = '';
	return url.href;
}

function normalizeUrlPrefix(value: string): string {
	const url = new URL(value, window.location.origin);
	url.search = '';
	url.hash = '';
	return url.href.replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
