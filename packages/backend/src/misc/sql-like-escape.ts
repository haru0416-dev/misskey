/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function sqlLikeEscape(s: string) {
	return s.replaceAll(/([\\%_])/g, '\\$1');
}
