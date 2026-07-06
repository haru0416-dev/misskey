/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// UUIDv7 (RFC 9562)
// DBのid列 (varchar(32)) に収めるため、ハイフン無しの小文字hex 32桁で表現する。
// レイアウト: [48bit unixミリ秒] + [4bit version=7] + [12bit カウンタ上位] + [2bit variant=0b10] + [14bit カウンタ下位] + [48bit ランダム]
// カウンタは RFC 9562 §6.2 の固定長専用カウンタ方式 (rand_a 12bit + rand_b 上位14bit = 26bit)。
// aid/aidx と同様に時刻に依存しないプロセス内グローバルカウンタとすることで、
// 同一ミリ秒内でも生成順とソート順が常に一致する (タイムラインのページネーションが前提とする性質)。

import * as crypto from 'node:crypto';

export const uuidv7RegExp = /^[0-9a-f]{32}$/;

const TIME_LENGTH = 12; // 48bit = hex 12桁
const COUNTER_MASK = 0x03ffffff; // 26bit

let counter = crypto.randomBytes(4).readUInt32BE(0) & COUNTER_MASK;

export function genUuidv7(t: number): string {
	if (isNaN(t)) throw new Error('Failed to create UUIDv7: Invalid Date');
	if (t < 0) t = 0;

	counter = (counter + 1) & COUNTER_MASK;

	const time = t.toString(16).padStart(TIME_LENGTH, '0').slice(-TIME_LENGTH);
	const verAndRandA = (0x7000 | (counter >>> 14)).toString(16); // version 7 + カウンタ上位12bit
	const randB = crypto.randomBytes(8);
	randB[0] = 0x80 | ((counter >>> 8) & 0x3f); // variant 0b10 + カウンタ中位6bit
	randB[1] = counter & 0xff; // カウンタ下位8bit
	return time + verAndRandA + randB.toString('hex');
}

export function parseUuidv7(id: string): { date: Date; } {
	return { date: new Date(parseInt(id.slice(0, TIME_LENGTH), 16)) };
}

export function parseUuidv7Full(id: string): { date: number; additional: bigint; } {
	// additional は uint64 として扱われる (Redis stream IDのシーケンス部など) ため、
	// タイムスタンプ以降の80bit接尾辞の上位64bitを採用する。version/variantの固定bitは
	// 全IDで同位置・同値なので相対順序に影響せず、26bitカウンタも完全に含まれる
	return {
		date: parseInt(id.slice(0, TIME_LENGTH), 16),
		additional: BigInt('0x' + id.slice(TIME_LENGTH)) >> 16n,
	};
}

export function isSafeUuidv7T(t: number): boolean {
	return t > 0;
}
