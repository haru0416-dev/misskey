/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
import type { SchemaType } from '@/misc/json-schema.js';
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

const adminAvatarDecorationsCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		url: { type: 'string', minLength: 1 },
		roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: {
			type: 'string',
		} },
		category: { type: 'string', nullable: true },
	},
	required: ['name', 'description', 'url'],
} as const;

const adminAvatarDecorationsDeleteParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminAvatarDecorationsListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

const adminAvatarDecorationsUpdateParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		url: { type: 'string', minLength: 1 },
		roleIdsThatCanBeUsedThisDecoration: { type: 'array', items: {
			type: 'string',
		} },
		category: { type: 'string', nullable: true },
	},
	required: ['id'],
} as const;


function packAdminAvatarDecorationForHonoApi(
	config: Config,
	decoration: MiAvatarDecoration,
): AdminAvatarDecoration {
	return {
		id: decoration.id,
		createdAt: parseId(config, decoration.id).date.toISOString(),
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
		genId: () => genId(deps.config),
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
