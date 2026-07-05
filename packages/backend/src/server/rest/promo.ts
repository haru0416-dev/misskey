/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { createPromoNoteInDatabase, isPromoNoteExists } from '@/core/PromoNoteStore.js';
import { createPromoReadInDatabase, isPromoReadExists } from '@/core/PromoReadStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

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

const adminPromoCreateParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		expiresAt: { type: 'integer' },
	},
	required: ['noteId', 'expiresAt'],
} as const;

type PromoReadParams = {
	noteId: string;
};

type AdminPromoCreateParams = {
	noteId: string;
	expiresAt: number;
};

function noSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'd785b897-fcd3-4fe9-8fc3-b85c26e6c932',
	});
}

function adminPromoNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'ee449fbe-af2a-453b-9cae-cf2fe7c895fc',
	});
}

function alreadyPromotedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'The note has already promoted.',
		code: 'ALREADY_PROMOTED',
		id: 'ae427aa2-7a41-484f-a18c-2c1104051604',
	});
}

export async function handleHonoApiPromoRead(
	deps: HonoApiPromoDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(promoReadParamDef, body);
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

export async function handleHonoApiAdminPromoCreate(
	deps: HonoApiPromoDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminPromoCreateParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);

	if (note == null) {
		throw adminPromoNoSuchNoteError();
	}

	if (await isPromoNoteExists(deps.db, note.id)) {
		throw alreadyPromotedError();
	}

	await createPromoNoteInDatabase(deps.db, {
		noteId: note.id,
		expiresAt: new Date(params.expiresAt),
		userId: note.userId,
	});
}
