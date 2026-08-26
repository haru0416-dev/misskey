/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InternalEventTypes } from '@/core/global-events.js';
import {
	createAvatarDecorationInDatabase,
	deleteAvatarDecorationFromDatabase,
	fetchAvatarDecorationFromDatabase,
	updateAvatarDecorationInDatabase,
} from '@/core/avatar-decoration/AvatarDecorationStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import type { MiUser } from '@/models/User.js';
import type { ModerationLogPayloads } from '@/types.js';

export type AvatarDecorationCreateOptions = Pick<MiAvatarDecoration, 'name' | 'description' | 'url'> &
	Partial<Pick<MiAvatarDecoration, 'roleIdsThatCanBeUsedThisDecoration' | 'category'>>;

export type AvatarDecorationUpdateOptions = Partial<
	Pick<MiAvatarDecoration, 'name' | 'description' | 'url' | 'roleIdsThatCanBeUsedThisDecoration' | 'category'>
>;

export type AvatarDecorationLogicDependencies = {
	db: MiDrizzleDatabase;
	genId: () => string;
	publishInternalEvent?:
		| (<K extends keyof InternalEventTypes>(type: K, value?: InternalEventTypes[K]) => void)
		| undefined;
	logModeration?: <T extends keyof ModerationLogPayloads>(
		moderator: { id: MiUser['id'] },
		type: T,
		info?: ModerationLogPayloads[T],
	) => void | Promise<void>;
};

export async function createAvatarDecorationWithSideEffects(
	deps: AvatarDecorationLogicDependencies,
	options: AvatarDecorationCreateOptions,
	moderator?: MiUser,
): Promise<MiAvatarDecoration> {
	const created = await createAvatarDecorationInDatabase(deps.db, {
		id: deps.genId(),
		...options,
		name: options.name,
		description: options.description,
		url: options.url,
	});

	deps.publishInternalEvent?.('avatarDecorationCreated', created as MiAvatarDecoration);

	if (moderator) {
		void deps.logModeration?.(moderator, 'createAvatarDecoration', {
			avatarDecorationId: created.id,
			avatarDecoration: created,
		});
	}

	return created as MiAvatarDecoration;
}

export async function updateAvatarDecorationWithSideEffects(
	deps: Pick<AvatarDecorationLogicDependencies, 'db' | 'publishInternalEvent' | 'logModeration'>,
	id: MiAvatarDecoration['id'],
	params: AvatarDecorationUpdateOptions,
	moderator?: MiUser,
): Promise<void> {
	const avatarDecoration = await fetchAvatarDecorationFromDatabase(deps.db, id);
	if (!avatarDecoration) {
		throw new Error('Avatar decoration was not found');
	}

	const updated = await updateAvatarDecorationInDatabase(deps.db, avatarDecoration.id, {
		updatedAt: new Date(),
		...params,
	});
	if (!updated) {
		throw new Error('Avatar decoration was not found after update');
	}

	deps.publishInternalEvent?.('avatarDecorationUpdated', updated as MiAvatarDecoration);

	if (moderator) {
		void deps.logModeration?.(moderator, 'updateAvatarDecoration', {
			avatarDecorationId: avatarDecoration.id,
			before: avatarDecoration,
			after: updated,
		});
	}
}

export async function deleteAvatarDecorationWithSideEffects(
	deps: Pick<AvatarDecorationLogicDependencies, 'db' | 'publishInternalEvent' | 'logModeration'>,
	id: MiAvatarDecoration['id'],
	moderator?: MiUser,
): Promise<void> {
	const avatarDecoration = await fetchAvatarDecorationFromDatabase(deps.db, id);
	if (!avatarDecoration) {
		throw new Error('Avatar decoration was not found');
	}

	await deleteAvatarDecorationFromDatabase(deps.db, avatarDecoration.id);
	deps.publishInternalEvent?.('avatarDecorationDeleted', avatarDecoration as MiAvatarDecoration);

	if (moderator) {
		void deps.logModeration?.(moderator, 'deleteAvatarDecoration', {
			avatarDecorationId: avatarDecoration.id,
			avatarDecoration,
		});
	}
}
