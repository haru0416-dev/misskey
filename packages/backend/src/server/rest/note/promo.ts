/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as adminContracts } from '@/server/api/metas/admin.js';
import type { endpointMetas as miscContracts } from '@/server/api/metas/misc.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import { fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { createPromoNoteInDatabase, isPromoNoteExists } from '@/core/note/PromoNoteStore.js';
import { createPromoReadInDatabase, isPromoReadExists } from '@/core/note/PromoReadStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiPromoDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export const promoReadParamDef = z.object({
	noteId: misskeyId(),
});

export const adminPromoCreateParamDef = z.object({
	noteId: misskeyId(),
	expiresAt: z.int(),
});

export async function handleApiPromoRead(
	deps: ApiPromoDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof promoReadParamDef>,
	errors: ContractErrors<(typeof miscContracts)['promo/read']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);

	if (note == null) {
		throw errors.noSuchNote();
	}

	if (await isPromoReadExists(deps.db, me.id, note.id)) {
		return;
	}

	await createPromoReadInDatabase(deps.db, {
		id: genId(),
		noteId: note.id,
		userId: me.id,
	});
}

export async function handleApiAdminPromoCreate(
	deps: ApiPromoDependencies,
	params: ApiParams<typeof adminPromoCreateParamDef>,
	errors: ContractErrors<(typeof adminContracts)['admin/promo/create']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);

	if (note == null) {
		throw errors.noSuchNote();
	}

	if (await isPromoNoteExists(deps.db, note.id)) {
		throw errors.alreadyPromoted();
	}

	await createPromoNoteInDatabase(deps.db, {
		noteId: note.id,
		expiresAt: new Date(params.expiresAt),
		userId: note.userId,
	});
}
