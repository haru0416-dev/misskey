/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchFlashByIdFromDatabase, updateFlashInDatabase } from '@/core/FlashStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiFlash } from '@/models/Flash.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFlashDependencies = {
	db: MiDrizzleDatabase;
};

const flashUpdateParamDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string' },
		summary: { type: 'string' },
		script: { type: 'string' },
		permissions: { type: 'array', items: {
			type: 'string',
		} },
		visibility: { type: 'string', enum: ['public', 'private'] },
	},
	required: ['flashId'],
} as const;

type FlashUpdateParams = {
	flashId: string;
	title?: string;
	summary?: string;
	script?: string;
	permissions?: string[];
	visibility?: MiFlash['visibility'];
};

function clientError(status: number, message: string, code: string, id: string): HonoApiError {
	return new HonoApiError({
		status,
		message,
		code,
		id,
	});
}

export async function handleHonoApiFlashUpdate(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashUpdateParamDef, body) as FlashUpdateParams;
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientError(400, 'No such flash.', 'NO_SUCH_FLASH', '611e13d2-309e-419a-a5e4-e0422da39b02');
	}
	if (flash.userId !== me.id) {
		throw clientError(400, 'Access denied.', 'ACCESS_DENIED', '08e60c88-5948-478e-a132-02ec701d67b2');
	}

	const values: Partial<Parameters<typeof updateFlashInDatabase>[2]> = {
		updatedAt: new Date(),
	};
	if (params.title !== undefined) values.title = params.title;
	if (params.summary !== undefined) values.summary = params.summary;
	if (params.script !== undefined) values.script = params.script;
	if (params.permissions !== undefined) values.permissions = params.permissions;
	if (params.visibility !== undefined) values.visibility = params.visibility;

	await updateFlashInDatabase(deps.db, flash.id, values);
}
