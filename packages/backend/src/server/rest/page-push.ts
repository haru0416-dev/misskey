/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { fetchPageByIdFromDatabase } from '@/core/page/PageStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiMainStreamPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { packUserDetailedForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiPagePushDependencies = UserPackingDependencies & {
	publishMainStream?: HonoApiMainStreamPublisher;
};

export const pagePushParamDef = z.object({
	pageId: misskeyId(),
	event: z.string(),
	var: z.unknown().optional(),
});

type PagePushParams = {
	pageId: string;
	event: string;
	var?: unknown;
};

function noSuchPageError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such page.',
		code: 'NO_SUCH_PAGE',
		id: '4a13ad31-6729-46b4-b9af-e86b265c2e74',
	});
}

export async function handleHonoApiPagePush(
	deps: HonoApiPagePushDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(pagePushParamDef, body);
	const page = await fetchPageByIdFromDatabase(deps.db, params.pageId);
	if (page == null) {
		throw noSuchPageError();
	}

	deps.publishMainStream?.(page.userId, 'pageEvent', {
		pageId: params.pageId,
		event: params.event,
		var: params.var,
		userId: me.id,
		user: await packUserDetailedForHonoApi(deps, me, { id: page.userId }),
	});
}
