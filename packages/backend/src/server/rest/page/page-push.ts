/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as miscContracts } from '@/server/rest/contracts/misc.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { fetchPageByIdFromDatabase } from '@/core/page/PageStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MainStreamPublisher } from '../../../core/events.js';
import { ApiError } from '../error.js';
import { packUserDetailedForApi } from '../user/user.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import { parseApiParams } from '../validation.js';

export type ApiPagePushDependencies = UserPackingDependencies & {
	publishMainStream?: MainStreamPublisher;
};

export const pagePushParamDef = z.object({
	pageId: misskeyId(),
	event: z.string(),
	var: z.unknown().optional(),
});

export async function handleApiPagePush(
	deps: ApiPagePushDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof pagePushParamDef>,
	errors: ContractErrors<(typeof miscContracts)['page-push']>,
): Promise<void> {
	const page = await fetchPageByIdFromDatabase(deps.db, params.pageId);
	if (page == null) {
		throw errors.noSuchPage();
	}

	deps.publishMainStream?.(page.userId, 'pageEvent', {
		pageId: params.pageId,
		event: params.event,
		var: params.var,
		userId: me.id,
		user: await packUserDetailedForApi(deps, me, { id: page.userId }),
	});
}
