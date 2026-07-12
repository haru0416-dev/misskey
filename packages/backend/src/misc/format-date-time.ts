/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

function pad2(value: number): string {
	return value.toString().padStart(2, '0');
}

export function formatTime(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatDateTimeForFileName(date: Date): string {
	return [
		date.getFullYear(),
		pad2(date.getMonth() + 1),
		pad2(date.getDate()),
		pad2(date.getHours()),
		pad2(date.getMinutes()),
		pad2(date.getSeconds()),
	].join('-');
}
