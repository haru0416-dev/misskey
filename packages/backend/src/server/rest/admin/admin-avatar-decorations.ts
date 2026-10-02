/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import {
	createAvatarDecorationWithSideEffects,
	deleteAvatarDecorationWithSideEffects,
	updateAvatarDecorationWithSideEffects,
} from '@/core/avatar-decoration/avatar-decoration-logic.js';
import type {
	AvatarDecorationCreateOptions,
	AvatarDecorationUpdateOptions,
} from '@/core/avatar-decoration/avatar-decoration-logic.js';
import { listAvatarDecorationsFromDatabase } from '@/core/avatar-decoration/avatar-decoration-store.js';
import { logModerationEventInDatabase } from '@/core/moderation/moderation-log-logic.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import type { MiLocalUser } from '@/models/User.js';
import type { InternalEventPublisher } from '../../../core/events.js';
import { parseApiParams } from '../validation.js';

export type AdminAvatarDecorationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: InternalEventPublisher;
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

function packAdminAvatarDecoration(config: Config, decoration: MiAvatarDecoration): AdminAvatarDecoration {
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
	deps: AdminAvatarDecorationDependencies,
	me: MiLocalUser,
	params: Params<typeof adminAvatarDecorationsCreateParamDef>,
): Promise<AdminAvatarDecoration> {
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

	return packAdminAvatarDecoration(deps.config, created);
}

export async function handleApiAdminAvatarDecorationsDelete(
	deps: AdminAvatarDecorationDependencies,
	me: MiLocalUser,
	params: Params<typeof adminAvatarDecorationsDeleteParamDef>,
): Promise<void> {
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
	deps: AdminAvatarDecorationDependencies,
): Promise<AdminAvatarDecoration[]> {
	const decorations = await listAvatarDecorationsFromDatabase(deps.db);

	return decorations.map((decoration) => packAdminAvatarDecoration(deps.config, decoration as MiAvatarDecoration));
}

export async function handleApiAdminAvatarDecorationsUpdate(
	deps: AdminAvatarDecorationDependencies,
	me: MiLocalUser,
	params: Params<typeof adminAvatarDecorationsUpdateParamDef>,
): Promise<void> {
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
