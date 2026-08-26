/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { hashPassword } from '@/misc/password.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiMeta } from '@/models/_.js';
import {
	createOrFetchSystemAccountInDatabase,
	fetchSystemAccountUserFromDatabase,
} from '@/core/system-account/SystemAccountStore.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { generateNativeUserToken } from '@/misc/token.js';

export const SYSTEM_ACCOUNT_TYPES = ['actor', 'relay', 'proxy'] as const;

export type SystemAccountType = (typeof SYSTEM_ACCOUNT_TYPES)[number];

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
	const hash = await hashPassword(password);
	const keyPair = await genRsaKeyPair();

	return await createOrFetchSystemAccountInDatabase(db, {
		id: genId(),
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
