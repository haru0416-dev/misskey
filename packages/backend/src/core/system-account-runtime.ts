/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/_.js';
import { createOrFetchSystemAccountInDatabase, fetchSystemAccountUserFromDatabase } from '@/core/SystemAccountStore.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { generateNativeUserToken } from '@/misc/token.js';

export const SYSTEM_ACCOUNT_TYPES = ['actor', 'relay', 'proxy'] as const;

export type SystemAccountType = typeof SYSTEM_ACCOUNT_TYPES[number];

export async function fetchOrCreateSystemAccount(
	db: MiDrizzleDatabase,
	config: Config,
	meta: MiMeta,
	type: SystemAccountType,
): Promise<MiLocalUser> {
	const existing = await fetchSystemAccountUserFromDatabase(db, type);
	if (existing != null) return existing;

	const username: MiUser['username'] = `system.${type}`;
	const password = randomUUID();
	const salt = await bcrypt.genSalt(8);
	const hash = await bcrypt.hash(password, salt);
	const keyPair = await genRsaKeyPair();

	return await createOrFetchSystemAccountInDatabase(db, {
		id: genId(config),
		type,
		username,
		usernameLower: username.toLowerCase(),
		name: meta.name,
		token: generateNativeUserToken(),
		passwordHash: hash,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});
}
