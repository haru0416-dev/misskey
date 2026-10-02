/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listAvatarDecorationsFromDatabase } from '@/core/avatar-decoration/avatar-decoration-store.js';
import { listRolesFromDatabase } from '@/core/role/role-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseApiParams } from '../validation.js';

export type AvatarDecorationDependencies = {
	db: MiDrizzleDatabase;
};

export const getAvatarDecorationsParamDef = z.object({});

export async function handleApiGetAvatarDecorations(deps: AvatarDecorationDependencies): Promise<
	{
		id: string;
		name: string;
		description: string;
		url: string;
		roleIdsThatCanBeUsedThisDecoration: string[];
		category: string | null;
	}[]
> {
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
