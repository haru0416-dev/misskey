/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	createAccessTokenInDatabase,
	existsAccessTokenByAppIdAndUserIdFromDatabase,
	fetchAccessTokenByAppIdAndUserIdOrFailFromDatabase,
} from '@/core/app/AccessTokenStore.js';
import {
	createAuthSessionInDatabase,
	deleteAuthSessionByIdFromDatabase,
	fetchAuthSessionByTokenAndAppIdFromDatabase,
	fetchAuthSessionByTokenFromDatabase,
	updateAuthSessionUserIdInDatabase,
} from '@/core/app/AuthSessionStore.js';
import { fetchAppByIdOrFailFromDatabase, fetchAppBySecretFromDatabase } from '@/core/app/AppStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import type { AuthSessionRow } from '@/db/schema/auth-session.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { packApiApp, type ApiAppDependencies } from './app.js';
import { packUserDetailedNotMeForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAuthSessionDependencies = ApiAppDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export const authSessionGenerateParamDef = z.object({
	appSecret: z.string(),
});

export const authSessionShowParamDef = z.object({
	token: z.string(),
});

export const authSessionUserkeyParamDef = z.object({
	appSecret: z.string(),
	token: z.string(),
});

type AuthSessionGenerateParams = {
	appSecret: string;
};

type AuthSessionShowParams = {
	token: string;
};

type AuthSessionUserkeyParams = {
	appSecret: string;
	token: string;
};

function noSuchGenerateAppError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such app.',
		code: 'NO_SUCH_APP',
		id: '92f93e63-428e-4f2f-a5a4-39e1407fe998',
	});
}

function noSuchUserkeyAppError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such app.',
		code: 'NO_SUCH_APP',
		id: 'fcab192a-2c5a-43b7-8ad8-9b7054d8d40d',
	});
}

function noSuchSessionShowError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such session.',
		code: 'NO_SUCH_SESSION',
		id: 'bd72c97d-eba7-4adb-a467-f171b8847250',
	});
}

function noSuchSessionAcceptError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such session.',
		code: 'NO_SUCH_SESSION',
		id: '9c72d8de-391a-43c1-9d06-08d29efde8df',
	});
}

function noSuchSessionUserkeyError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such session.',
		code: 'NO_SUCH_SESSION',
		id: '5b5a1503-8bc8-4bd0-8054-dc189e8cdcb3',
	});
}

function pendingSessionError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'This session is not completed yet.',
		code: 'PENDING_SESSION',
		id: '8c8a4145-02cc-4cca-8e66-29ba60445a8e',
	});
}

async function packApiAuthSession(
	deps: ApiAuthSessionDependencies,
	session: AuthSessionRow,
	user: { id: MiUser['id'] } | null,
): Promise<{
	id: string;
	app: Awaited<ReturnType<typeof packApiApp>>;
	token: string;
}> {
	return {
		id: session.id,
		app: await packApiApp(deps, session.appId, user),
		token: session.token,
	};
}

export async function handleApiAuthSessionGenerate(
	deps: ApiAuthSessionDependencies,
	body: Record<string, unknown>,
): Promise<{ token: string; url: string }> {
	const params = parseApiParams(authSessionGenerateParamDef, body);
	const app = await fetchAppBySecretFromDatabase(deps.db, params.appSecret);
	if (app == null) throw noSuchGenerateAppError();

	const token = randomUUID();
	const session = await createAuthSessionInDatabase(deps.db, {
		id: genId(),
		appId: app.id,
		token,
	});

	return {
		token: session.token,
		url: `${deps.config.runtime.authUrl}/${session.token}`,
	};
}

export async function handleApiAuthSessionShow(
	deps: ApiAuthSessionDependencies,
	user: { id: MiUser['id'] } | null,
	body: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof packApiAuthSession>>> {
	const params = parseApiParams(authSessionShowParamDef, body);
	const session = await fetchAuthSessionByTokenFromDatabase(deps.db, params.token);
	if (session == null) throw noSuchSessionShowError();

	return await packApiAuthSession(deps, session, user);
}

export async function handleApiAuthAccept(
	deps: ApiAuthSessionDependencies,
	user: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(authSessionShowParamDef, body);
	const session = await fetchAuthSessionByTokenFromDatabase(deps.db, params.token);
	if (session == null) throw noSuchSessionAcceptError();

	const accessToken = secureRndstr(32);
	const exists = await existsAccessTokenByAppIdAndUserIdFromDatabase(deps.db, session.appId, user.id);

	if (!exists) {
		const app = await fetchAppByIdOrFailFromDatabase(deps.db, session.appId);
		const hash = crypto
			.createHash('sha256')
			.update(accessToken + app.secret)
			.digest('hex');
		const now = new Date();

		await createAccessTokenInDatabase(deps.db, {
			id: genId(now.getTime()),
			lastUsedAt: now,
			appId: session.appId,
			userId: user.id,
			token: accessToken,
			hash,
		});
	}

	await updateAuthSessionUserIdInDatabase(deps.db, session.id, user.id);
}

export async function handleApiAuthSessionUserkey(
	deps: ApiAuthSessionDependencies,
	body: Record<string, unknown>,
): Promise<{
	accessToken: string;
	user: Record<string, unknown>;
}> {
	const params = parseApiParams(authSessionUserkeyParamDef, body);
	const app = await fetchAppBySecretFromDatabase(deps.db, params.appSecret);
	if (app == null) throw noSuchUserkeyAppError();

	const session = await fetchAuthSessionByTokenAndAppIdFromDatabase(deps.db, params.token, app.id);
	if (session == null) throw noSuchSessionUserkeyError();
	if (session.userId == null) throw pendingSessionError();

	const accessToken = await fetchAccessTokenByAppIdAndUserIdOrFailFromDatabase(deps.db, app.id, session.userId);
	await deleteAuthSessionByIdFromDatabase(deps.db, session.id);

	return {
		accessToken: accessToken.token,
		user: await packUserDetailedNotMeForApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, session.userId)),
	};
}
