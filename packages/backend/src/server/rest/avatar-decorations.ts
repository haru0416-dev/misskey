/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listAvatarDecorationsFromDatabase } from '@/core/avatar-decoration/AvatarDecorationStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAvatarDecorationDependencies = {
	db: MiDrizzleDatabase;
};

export const getAvatarDecorationsParamDef = z.object({});

export async function handleHonoApiGetAvatarDecorations(
	deps: HonoApiAvatarDecorationDependencies,
	body: Record<string, unknown>,
): Promise<
	{
		id: string;
		name: string;
		description: string;
		url: string;
		roleIdsThatCanBeUsedThisDecoration: string[];
		category: string | null;
	}[]
> {
	parseHonoApiParams(getAvatarDecorationsParamDef, body);
	const decorations = await listAvatarDecorationsFromDatabase(deps.db);
	const allRoles = await listRolesFromDatabase(deps.db);
	const roleIds = new Set(allRoles.map((role) => role.id));

	return decorations.map((decoration) => ({
		id: decoration.id,
		name: decoration.name,
		description: decoration.description,
		url: decoration.url,
		roleIdsThatCanBeUsedThisDecoration: decoration.roleIdsThatCanBeUsedThisDecoration.filter((roleId) =>
			roleIds.has(roleId),
		),
		category: decoration.category,
	}));
}
