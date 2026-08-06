/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { hashPassword } from '@/misc/password.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { createOrFetchSystemAccountInDatabase, fetchSystemAccountUserFromDatabase } from '@/core/SystemAccountStore.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { generateNativeUserToken } from '@/misc/token.js';
import type { SYSTEM_ACCOUNT_TYPES } from '@/core/system-account-runtime.js';

export type SystemAccountType = (typeof SYSTEM_ACCOUNT_TYPES)[number];

export type SystemAccountLogicDependencies = {
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'name'>;
	genId: () => MiUser['id'];
};

export async function fetchOrCreateSystemAccountInDatabase(
	deps: SystemAccountLogicDependencies,
	type: SystemAccountType,
): Promise<MiLocalUser> {
	const systemAccount = await fetchSystemAccountUserFromDatabase(deps.db, type);
	if (systemAccount != null) return systemAccount;

	const username = `system.${type}`;
	const password = randomUUID();
	const hash = await hashPassword(password);
	const keyPair = await genRsaKeyPair();

	return await createOrFetchSystemAccountInDatabase(deps.db, {
		id: deps.genId(),
		type,
		username,
		usernameLower: username.toLowerCase(),
		name: deps.meta.name,
		token: generateNativeUserToken(),
		passwordHash: hash,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});
}
