/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 一意なランダム文字列であればよいが、時系列で並べられるよう aid と同じ形式で生成する。

const TIME2000 = 946_684_800_000;
let counter = Math.floor(Math.random() * 10_000);

function getTime(time: number): string {
	time = time - TIME2000;
	if (time < 0) {
		time = 0;
	}

	return time.toString(36).padStart(8, '0');
}

function getNoise(): string {
	return counter.toString(36).padStart(2, '0').slice(-2);
}

export function genId(): string {
	counter++;
	return getTime(Date.now()) + getNoise();
}
