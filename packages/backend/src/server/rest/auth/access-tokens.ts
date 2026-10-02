/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	deleteAccessTokenByIdAndUserIdFromDatabase,
	fetchAccessTokenByTokenFromDatabase,
	listAccessTokensByUserIdFromDatabase,
} from '@/core/app/access-token-store.js';
import type { AccessTokenOrderField } from '@/core/app/access-token-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiUser } from '@/models/User.js';
import { permissionDeniedError } from '../error.js';
import { parseApiParams } from '../validation.js';
import type { CredentialEventPublisher } from '../../../core/events.js';

export type AccessTokenDependencies = {
	db: MiDrizzleDatabase;
	publishCredentialEvent: CredentialEventPublisher;
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
	deps: AccessTokenDependencies,
	user: { id: MiUser['id'] },
	params: Params<typeof iAppsParamDef>,
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

/**
 * DB から消すのは自分のトークンだけ。削除済みのトークンでも失効イベントを発行し、残った接続を切断する。
 * アプリのトークンで対象を指定したときは、そのトークン自身だけを消せる。
 */
export async function handleApiIRevokeToken(
	deps: AccessTokenDependencies,
	user: { id: MiUser['id'] },
	token: { id: MiAccessToken['id'] } | null,
	params: Params<typeof iRevokeTokenParamDef>,
): Promise<void> {
	let target: { id: MiAccessToken['id'] } | null;
	if ('tokenId' in params) {
		target = { id: params.tokenId };
	} else if (params.token) {
		const found = await fetchAccessTokenByTokenFromDatabase(deps.db, params.token);
		if (found == null) {
			// DB 削除後に publish が失敗した再試行でも、旧接続の資格を特定できる。
			await deps.publishCredentialEvent('accessTokenRevoked', {
				tokenHash: createHash('sha256').update(params.token).digest('hex'),
			});
			return;
		}
		target = found.userId === user.id ? found : null;
	} else {
		return;
	}
	if (target == null) {
		return;
	}

	if (token != null && token.id !== target.id) {
		throw permissionDeniedError();
	}
	await deleteAccessTokenByIdAndUserIdFromDatabase(deps.db, target.id, user.id);
	await deps.publishCredentialEvent('accessTokenRevoked', { userId: user.id, tokenId: target.id });
}
