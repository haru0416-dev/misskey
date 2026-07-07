/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';

// 従来実装 (bcrypt.genSalt(8)) と同じコスト
const BCRYPT_COST = 8;

// bcrypt は 72 バイトまでしか見ない。bcryptjs は暗黙に切り詰めるが、
// Bun.password は 72 バイト超のパスワードを SHA-512 で前処理するため
// 既存ハッシュと互換にならない。超過時は必ず bcryptjs 経路を使う。
const BCRYPT_MAX_BYTES = 72;

const bunPassword = typeof Bun !== 'undefined' ? Bun.password : null;

function canUseBunPassword(password: string): boolean {
	return bunPassword != null && Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES;
}

export function hashPassword(password: string): Promise<string> {
	if (canUseBunPassword(password)) {
		return bunPassword!.hash(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
	}
	return bcrypt.hash(password, BCRYPT_COST);
}

export function hashPasswordSync(password: string): string {
	if (canUseBunPassword(password)) {
		return bunPassword!.hashSync(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
	}
	return bcrypt.hashSync(password, BCRYPT_COST);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
	if (canUseBunPassword(password)) {
		try {
			return await bunPassword!.verify(password, hash, 'bcrypt');
		} catch {
			// Bun が扱えないハッシュ形式 ($2a$ 等) は bcryptjs で照合する
		}
	}
	return bcrypt.compare(password, hash);
}
