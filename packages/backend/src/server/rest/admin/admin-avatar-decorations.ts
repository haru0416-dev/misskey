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
} from '@/core/avatar-decoration/AvatarDecorationLogic.js';
import { listAvatarDecorationsFromDatabase } from '@/core/avatar-decoration/AvatarDecorationStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ApiInternalEventPublisher } from '../events.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminAvatarDecorationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: ApiInternalEventPublisher;
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
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
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

function packAdminAvatarDecorationForApi(config: Config, decoration: MiAvatarDecoration): AdminAvatarDecoration {
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

export async function handleApiAdminAvatarDecorationsCreate(
	deps: ApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<AdminAvatarDecoration> {
	const params = parseApiParams(adminAvatarDecorationsCreateParamDef, body);
	const created = await createAvatarDecorationWithSideEffects(
		{
			db: deps.db,
			genId,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		{
			name: params.name,
			description: params.description,
			url: params.url,
			roleIdsThatCanBeUsedThisDecoration: params.roleIdsThatCanBeUsedThisDecoration,
			category: params.category,
		} as AvatarDecorationCreateOptions,
		me,
	);

	return packAdminAvatarDecorationForApi(deps.config, created);
}

export async function handleApiAdminAvatarDecorationsDelete(
	deps: ApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAvatarDecorationsDeleteParamDef, body);

	await deleteAvatarDecorationWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		params.id,
		me,
	);
}

export async function handleApiAdminAvatarDecorationsList(
	deps: ApiAdminAvatarDecorationDependencies,
	body: Record<string, unknown>,
): Promise<AdminAvatarDecoration[]> {
	parseApiParams(adminAvatarDecorationsListParamDef, body);
	const decorations = await listAvatarDecorationsFromDatabase(deps.db);

	return decorations.map((decoration) =>
		packAdminAvatarDecorationForApi(deps.config, decoration as MiAvatarDecoration),
	);
}

export async function handleApiAdminAvatarDecorationsUpdate(
	deps: ApiAdminAvatarDecorationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAvatarDecorationsUpdateParamDef, body);

	await updateAvatarDecorationWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		params.id,
		{
			name: params.name,
			description: params.description,
			url: params.url,
			roleIdsThatCanBeUsedThisDecoration: params.roleIdsThatCanBeUsedThisDecoration,
			category: params.category,
		} as AvatarDecorationUpdateOptions,
		me,
	);
}
