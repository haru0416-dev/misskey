/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { generateKeyPair } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { DI } from '@/di-symbols.js';
import { createSignupAccountInDatabase, isLocalUsernameTaken } from '@/core/SignupStore.js';
import { isUsedUsername } from '@/core/UsedUsernameStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { IdService } from '@/core/IdService.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import UsersChart from '@/core/chart/charts/users.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserService } from '@/core/UserService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { MetaService } from '@/core/MetaService.js';

@Injectable()
export class SignupService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private utilityService: UtilityService,
		private userService: UserService,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private systemAccountService: SystemAccountService,
		private metaService: MetaService,
		private usersChart: UsersChart,
	) {
	}

	@bindThis
	public async signup(opts: {
		username: MiUser['username'];
		password?: string | null;
		passwordHash?: MiUserProfile['password'] | null;
		host?: string | null;
		ignorePreservedUsernames?: boolean;
	}) {
		const { username, password, passwordHash, host } = opts;
		let hash = passwordHash;

		// Validate username
		if (!this.userEntityService.validateLocalUsername(username)) {
			throw new Error('INVALID_USERNAME');
		}

		if (password != null && passwordHash == null) {
			// Validate password
			if (!this.userEntityService.validatePassword(password)) {
				throw new Error('INVALID_PASSWORD');
			}

			// Generate hash of password
			const salt = await bcrypt.genSalt(8);
			hash = await bcrypt.hash(password, salt);
		}

		// Generate secret
		const secret = generateNativeUserToken();

		// Check username duplication
		if (await isLocalUsernameTaken(this.drizzle, username)) {
			throw new Error('DUPLICATED_USERNAME');
		}

		// Check deleted username duplication
		if (await isUsedUsername(this.drizzle, username)) {
			throw new Error('USED_USERNAME');
		}

		if (!opts.ignorePreservedUsernames && this.meta.rootUserId != null) {
			const isPreserved = this.meta.preservedUsernames.map(x => x.toLowerCase()).includes(username.toLowerCase());
			if (isPreserved) {
				throw new Error('USED_USERNAME');
			}

			const hasProhibitedWords = this.utilityService.isKeyWordIncluded(username.toLowerCase(), this.meta.prohibitedWordsForNameOfUser);
			if (hasProhibitedWords) {
				throw new Error('USED_USERNAME');
			}
		}

		const keyPair = await new Promise<string[]>((res, rej) =>
			generateKeyPair('rsa', {
				modulusLength: 2048,
				publicKeyEncoding: {
					type: 'spki',
					format: 'pem',
				},
				privateKeyEncoding: {
					type: 'pkcs8',
					format: 'pem',
					cipher: undefined,
					passphrase: undefined,
				},
			}, (err, publicKey, privateKey) =>
				err ? rej(err) : res([publicKey, privateKey]),
			));

		const account = await createSignupAccountInDatabase(this.drizzle, {
			id: this.idService.gen(),
			username,
			usernameLower: username.toLowerCase(),
			host: this.utilityService.toPunyNullable(host),
			token: secret,
			passwordHash: hash ?? null,
			publicKey: keyPair[0],
			privateKey: keyPair[1],
		});

		this.usersChart.update(account, true);
		this.userService.notifySystemWebhook(account, 'userCreated');

		if (this.meta.rootUserId == null) {
			await this.metaService.update({ rootUserId: account.id });
		}

		return { account, secret };
	}
}
