/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	createAvatarDecorationWithSideEffects,
	deleteAvatarDecorationWithSideEffects,
	updateAvatarDecorationWithSideEffects,
	type AvatarDecorationCreateOptions,
	type AvatarDecorationUpdateOptions,
} from '@/core/AvatarDecorationLogic.js';
import { listAvatarDecorationsFromDatabase } from '@/core/AvatarDecorationStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminAvatarDecorationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

type AdminAvatarDecoration = {
	id: string;
	createdAt: string;
	updatedAt: string | null;
	name: string;
	description: string;
	url: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
	category: string | null;
};

export const adminAvatarDecorationsCreateParamDef = z.object({
	name: z.string().min(1),
	description: z.string(),
	url: z.string().min(1),
	roleIdsThatCanBeUsedThisDecoration: z.array(z.string()).optional(),
	category: z.string().nullable().optional(),
});

export const adminAvatarDecorationsDeleteParamDef = z.object({
	id: misskeyId(),
});

export const adminAvatarDecorationsListParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	userId: misskeyId().nullable().optional(),
});

export const adminAvatarDecorationsUpdateParamDef = z.object({
	id: misskeyId(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	url: z.string().min(1).optional(),
	roleIdsThatCanBeUsedThisDecoration: z.array(z.string()).optional(),
	category: z.string().nullable().optional(),
});


function packAdminAvatarDecorationForHonoApi(
	config: Config,
	decoration: MiAvatarDecoration,
): AdminAvatarDecoration {
	return {
		id: decoration.id,
		createdAt: parseId(decoration.id).date.toISOString(),
		updatedAt: decoration.updatedAt?.toISOString() ?? null,
		name: decoration.name,
		description: decoration.description,
		url: decoration.url,
		roleIdsThatCanBeUsedThisDecoration: decoration.roleIdsThatCanBeUsedThisDecoration,
		category: decoration.category,
	};
}

export async function handleHonoApiAdminAvatarDecorationsCreate(
	deps: HonoApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<AdminAvatarDecoration> {
	const params = parseHonoApiParams(adminAvatarDecorationsCreateParamDef, body);
	const created = await createAvatarDecorationWithSideEffects({
		db: deps.db,
		genId,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, {
		name: params.name,
		description: params.description,
		url: params.url,
		roleIdsThatCanBeUsedThisDecoration: params.roleIdsThatCanBeUsedThisDecoration,
		category: params.category,
	} as AvatarDecorationCreateOptions, me);

	return packAdminAvatarDecorationForHonoApi(deps.config, created);
}

export async function handleHonoApiAdminAvatarDecorationsDelete(
	deps: HonoApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAvatarDecorationsDeleteParamDef, body);

	await deleteAvatarDecorationWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, params.id, me);
}

export async function handleHonoApiAdminAvatarDecorationsList(
	deps: HonoApiAdminAvatarDecorationDependencies,
	body: Record<string, unknown>,
): Promise<AdminAvatarDecoration[]> {
	parseHonoApiParams(adminAvatarDecorationsListParamDef, body);
	const decorations = await listAvatarDecorationsFromDatabase(deps.db);

	return decorations.map(decoration => packAdminAvatarDecorationForHonoApi(deps.config, decoration as MiAvatarDecoration));
}

export async function handleHonoApiAdminAvatarDecorationsUpdate(
	deps: HonoApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAvatarDecorationsUpdateParamDef, body);

	await updateAvatarDecorationWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, params.id, {
		name: params.name,
		description: params.description,
		url: params.url,
		roleIdsThatCanBeUsedThisDecoration: params.roleIdsThatCanBeUsedThisDecoration,
		category: params.category,
	} as AvatarDecorationUpdateOptions, me);
}
