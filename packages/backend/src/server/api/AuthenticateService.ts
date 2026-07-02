/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { AppRow } from '@/db/schema/app.js';
import { fetchAppByIdOrFailFromDatabase } from '@/core/AppStore.js';
import { deserializeAccessToken } from '@/db/schema/access-token.js';
import { fetchAccessTokenByHashOrTokenFromDatabase, updateAccessTokenLastUsedAtInDatabase } from '@/core/AccessTokenStore.js';
import { fetchLocalUserByIdFromDatabase, fetchLocalUserByNativeTokenFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { CacheService } from '@/core/CacheService.js';
import { isNativeUserToken } from '@/misc/token.js';
import { bindThis } from '@/decorators.js';

export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

@Injectable()
export class AuthenticateService implements OnApplicationShutdown {
	private appCache: MemoryKVCache<AppRow>;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private cacheService: CacheService,
	) {
		this.appCache = new MemoryKVCache<AppRow>(1000 * 60 * 60 * 24 * 7); // 1w
	}

	@bindThis
	public async authenticate(token: string | null | undefined): Promise<[MiLocalUser | null, MiAccessToken | null]> {
		if (token == null) {
			return [null, null];
		}

		if (isNativeUserToken(token)) {
			const user = await this.cacheService.localUserByNativeTokenCache.fetch(token,
				() => fetchLocalUserByNativeTokenFromDatabase(this.db, token));

			if (user == null) {
				throw new AuthenticationError('user not found');
			}

			return [user, null];
		} else {
			const accessToken = await fetchAccessTokenByHashOrTokenFromDatabase(this.db, token.toLowerCase(), token);

			if (accessToken == null) {
				throw new AuthenticationError('invalid signature');
			}

			updateAccessTokenLastUsedAtInDatabase(this.db, accessToken.id, new Date());

			const user = await this.cacheService.localUserByIdCache.fetch(accessToken.userId,
				async () => {
					const user = await fetchLocalUserByIdFromDatabase(this.db, accessToken.userId);
					if (user == null) throw new AuthenticationError('user not found');
					return user;
				});

			if (accessToken.appId) {
				const app = await this.appCache.fetch(accessToken.appId,
					() => fetchAppByIdOrFailFromDatabase(this.db, accessToken.appId!));

				return [user, {
					id: accessToken.id,
					permission: app.permission,
				} as MiAccessToken];
			} else {
				return [user, deserializeAccessToken(accessToken)];
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.appCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
