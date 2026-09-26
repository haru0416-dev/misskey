/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import type { EmailService } from '@/core/email/EmailService.js';
import { isUsedUsername } from '@/core/account/UsedUsernameStore.js';
import { countUsersActiveAfterFromDatabase, isLocalUsernameTaken } from '@/core/user/UserStore.js';
import { USER_ONLINE_THRESHOLD } from '@/const.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { localUsernameSchema } from '@/models/User.js';
import type { MiMeta } from '@/models/_.js';
import { parseApiParams } from '../validation.js';

export type ApiAvailabilityDependencies = {
	db: MiDrizzleDatabase;
	meta: MiMeta;
	emailService: Pick<EmailService, 'validateEmailForAccount'>;
};

export const usernameAvailableParamDef = z.object({
	username: localUsernameSchema,
});

export const emailAddressAvailableParamDef = z.object({
	emailAddress: z.string(),
});

export async function handleApiUsernameAvailable(
	deps: ApiAvailabilityDependencies,
	params: ApiParams<typeof usernameAvailableParamDef>,
): Promise<{ available: boolean }> {
	const [exists, used] = await Promise.all([
		isLocalUsernameTaken(deps.db, params.username),
		isUsedUsername(deps.db, params.username),
	]);
	const preserved = deps.meta.preservedUsernames
		.map((username) => username.toLowerCase())
		.includes(params.username.toLowerCase());

	return {
		available: !exists && !used && !preserved,
	};
}

export async function handleApiEmailAddressAvailable(
	deps: ApiAvailabilityDependencies,
	params: ApiParams<typeof emailAddressAvailableParamDef>,
): ReturnType<EmailService['validateEmailForAccount']> {
	return await deps.emailService.validateEmailForAccount(params.emailAddress);
}

export async function handleApiGetOnlineUsersCount(deps: ApiAvailabilityDependencies): Promise<{ count: number }> {
	const count = await countUsersActiveAfterFromDatabase(deps.db, new Date(Date.now() - USER_ONLINE_THRESHOLD));
	return {
		count,
	};
}
