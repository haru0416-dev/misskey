/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	deleteAccessTokenByIdAndUserIdFromDatabase,
	deleteAccessTokenByTokenAndUserIdFromDatabase,
	listAccessTokensByUserIdFromDatabase,
} from '@/core/app/AccessTokenStore.js';
import type { AccessTokenOrderField } from '@/core/app/AccessTokenStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiUser } from '@/models/User.js';
import { parseApiParams } from '../validation.js';

export type ApiAccessTokenDependencies = {
	db: MiDrizzleDatabase;
};

export const iAppsParamDef = z.object({
	sort: z.enum(['+createdAt', '-createdAt', '+lastUsedAt', '-lastUsedAt']).optional(),
});

// tokenId と token は互いに素なため、各分岐の型検査が他方へ影響しない z.union() で表す。
export const iRevokeTokenParamDef = z.union([
	z.object({ tokenId: misskeyId() }),
	z.object({ token: z.string().nullable() }),
]);

/** MiAuth・OAuth で発行した自分のアクセストークンの一覧。 */
export async function handleApiIApps(
	deps: ApiAccessTokenDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<
	{
		id: string;
		name?: string;
		createdAt: string;
		lastUsedAt?: string;
		permission: string[];
		iconUrl?: string | null;
		description?: string | null;
	}[]
> {
	const params = parseApiParams(iAppsParamDef, body);
	const field: AccessTokenOrderField =
		params.sort === '+lastUsedAt' || params.sort === '-lastUsedAt' ? 'lastUsedAt' : 'id';
	const direction = params.sort === '+createdAt' || params.sort === '+lastUsedAt' ? 'desc' : 'asc';
	const tokens = await listAccessTokensByUserIdFromDatabase(deps.db, user.id, { field, direction });

	return tokens.map((token) =>
		omitUndefined({
			id: token.id,
			name: token.name ?? undefined,
			createdAt: parseId(token.id).date.toISOString(),
			lastUsedAt: token.lastUsedAt?.toISOString(),
			permission: token.permission,
			iconUrl: token.iconUrl,
			description: token.description,
		}),
	);
}

/** 自分のトークンだけを消す。他人のトークンや存在しないトークンの指定は何もしない。 */
export async function handleApiIRevokeToken(
	deps: ApiAccessTokenDependencies,
	user: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(iRevokeTokenParamDef, body);

	if ('tokenId' in params) {
		await deleteAccessTokenByIdAndUserIdFromDatabase(deps.db, params.tokenId, user.id);
	} else if (params.token) {
		await deleteAccessTokenByTokenAndUserIdFromDatabase(deps.db, params.token, user.id);
	}
}
