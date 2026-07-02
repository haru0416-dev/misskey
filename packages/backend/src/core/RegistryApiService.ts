/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiRegistryItem } from '@/models/RegistryItem.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import {
	deleteRegistryItemFromDatabase,
	fetchRegistryItemFromDatabase,
	listRegistryItemsOfScopeFromDatabase,
	listRegistryKeysOfScopeFromDatabase,
	listRegistryScopeAndDomainsFromDatabase,
	setRegistryItemInDatabase,
} from '@/core/RegistryItemStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

@Injectable()
export class RegistryApiService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public async set(userId: MiUser['id'], domain: string | null, scope: string[], key: string, value: any) {
		// TODO: 作成できるキーの数を制限する
		const itemDomain = domain || null;

		await setRegistryItemInDatabase(this.drizzle, {
			id: this.idService.gen(),
			updatedAt: new Date(),
			userId: userId,
			domain: itemDomain,
			scope: scope,
			key: key,
			value: value,
		});

		if (domain == null) {
			// TODO: サードパーティアプリが傍受出来てしまうのでどうにかする
			this.globalEventService.publishMainStream(userId, 'registryUpdated', {
				scope: scope,
				key: key,
				value: value,
			});
		}
	}

	@bindThis
	public async getItem(userId: MiUser['id'], domain: string | null, scope: string[], key: string): Promise<MiRegistryItem | null> {
		return fetchRegistryItemFromDatabase(this.drizzle, userId, domain, scope, key);
	}

	@bindThis
	public async getAllItemsOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<MiRegistryItem[]> {
		return listRegistryItemsOfScopeFromDatabase(this.drizzle, userId, domain, scope);
	}

	@bindThis
	public async getAllKeysOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<string[]> {
		return listRegistryKeysOfScopeFromDatabase(this.drizzle, userId, domain, scope);
	}

	@bindThis
	public async getAllScopeAndDomains(userId: MiUser['id']): Promise<{ domain: string | null; scopes: string[][] }[]> {
		const items = await listRegistryScopeAndDomainsFromDatabase(this.drizzle, userId);

		const res = [] as { domain: string | null; scopes: string[][] }[];

		for (const item of items) {
			const target = res.find(x => x.domain === item.domain);
			if (target) {
				if (target.scopes.some(scope => scope.join('.') === item.scope.join('.'))) continue;
				target.scopes.push(item.scope);
			} else {
				res.push({
					domain: item.domain,
					scopes: [item.scope],
				});
			}
		}

		return res;
	}

	@bindThis
	public async remove(userId: MiUser['id'], domain: string | null, scope: string[], key: string) {
		await deleteRegistryItemFromDatabase(this.drizzle, userId, domain || null, scope, key);
	}
}
