/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { createPromoReadInDatabase, isPromoReadExists } from '@/core/PromoReadStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiPromoDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

const promoReadParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

type PromoReadParams = {
	noteId: string;
};

function noSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'd785b897-fcd3-4fe9-8fc3-b85c26e6c932',
	});
}

export async function handleHonoApiPromoRead(
	deps: HonoApiPromoDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(promoReadParamDef, body) as PromoReadParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);

	if (note == null) {
		throw noSuchNoteError();
	}

	if (await isPromoReadExists(deps.db, me.id, note.id)) {
		return;
	}

	await createPromoReadInDatabase(deps.db, {
		id: genId(deps.config),
		noteId: note.id,
		userId: me.id,
	});
}
