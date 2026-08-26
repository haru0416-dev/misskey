/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const BCRYPT_COST = 8;
const bunPassword = Bun!.password;

export function hashPassword(password: string): Promise<string> {
	return bunPassword.hash(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
}

export function hashPasswordSync(password: string): string {
	return bunPassword.hashSync(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
	try {
		return await bunPassword.verify(password, hash, 'bcrypt');
	} catch {
		return false;
	}
}
