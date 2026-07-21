/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function escapeHtml(text: string): string {
	return text
		.replaceAll(/&/g, '&amp;')
		.replaceAll(/</g, '&lt;')
		.replaceAll(/>/g, '&gt;')
		.replaceAll(/"/g, '&quot;')
		.replaceAll(/'/g, '&#039;');
}
