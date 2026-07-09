/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig, type Config } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { createAntennaInDatabase, deleteAntennaFromDatabase, fetchAntennaByIdOrFailFromDatabase } from '@/core/AntennaStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { onMoveAccountForHonoApi } from '@/server/rest/antennas.js';
import type { MiUser } from '@/models/User.js';

describe('onMoveAccountForHonoApi (AntennaService#onMoveAccount 相当)', () => {
	let config: Config;
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let owner: MiUser;
	const createdAntennaIds: string[] = [];

	beforeAll(async () => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		const id = genId();
		owner = await createUserInDatabase(db, {
			id,
			username: `antennamove${id}`,
			usernameLower: `antennamove${id}`.toLowerCase(),
			isExplorable: false,
		});
	});

	afterAll(async () => {
		for (const antennaId of createdAntennaIds.splice(0)) {
			await deleteAntennaFromDatabase(db, antennaId);
		}
		await pool.end();
	});

	function fabricateUser(username: string, host: string | null): MiUser {
		return { id: genId(), username, host } as MiUser;
	}

	async function createAntenna(users: string[], isActive = true): Promise<string> {
		const antenna = await createAntennaInDatabase(db, {
			id: genId(),
			lastUsedAt: new Date(),
			userId: owner.id,
			name: `test-antenna-${genId()}`,
			src: 'users',
			users,
			withFile: false,
			isActive,
		});
		createdAntennaIds.push(antenna.id);
		return antenna.id;
	}

	test('src を users に含むアンテナへ dst の acct を追記し、antennaUpdated を発行する', async () => {
		const src = fabricateUser(`srcuser${genId()}`, null);
		const dst = fabricateUser(`dstuser${genId()}`, 'remote.example.com');

		const hitAntennaId = await createAntenna([`@${src.username}`]);
		const unrelatedAntennaId = await createAntenna(['@someoneelse']);

		const publishInternalEvent = vi.fn();
		await onMoveAccountForHonoApi({ config, db, publishInternalEvent }, src, dst);

		const updated = await fetchAntennaByIdOrFailFromDatabase(db, hitAntennaId);
		expect(updated.users).toContain(`@${src.username}`);
		expect(updated.users).toContain(`@${dst.username}@${dst.host}`);

		const unrelated = await fetchAntennaByIdOrFailFromDatabase(db, unrelatedAntennaId);
		expect(unrelated.users).toEqual(['@someoneelse']);

		expect(publishInternalEvent).toHaveBeenCalledTimes(1);
		expect(publishInternalEvent.mock.calls[0][0]).toBe('antennaUpdated');
		expect((publishInternalEvent.mock.calls[0][1] as { id: string }).id).toBe(hitAntennaId);
	});

	test('非アクティブなアンテナは移行対象にならない (原典の getAntennas がアクティブのみ返す挙動)', async () => {
		const src = fabricateUser(`srcinactive${genId()}`, null);
		const dst = fabricateUser(`dstinactive${genId()}`, null);

		const inactiveAntennaId = await createAntenna([`@${src.username}`], false);

		const publishInternalEvent = vi.fn();
		await onMoveAccountForHonoApi({ config, db, publishInternalEvent }, src, dst);

		const antenna = await fetchAntennaByIdOrFailFromDatabase(db, inactiveAntennaId);
		expect(antenna.users).toEqual([`@${src.username}`]);
		expect(publishInternalEvent).not.toHaveBeenCalled();
	});

	test('リモートの src (user@host 形式の acct) も一致判定される', async () => {
		const src = fabricateUser(`remotesrc${genId()}`, 'old.example.com');
		const dst = fabricateUser(`remotedst${genId()}`, 'new.example.com');

		const antennaId = await createAntenna([`@${src.username}@${src.host}`]);

		const publishInternalEvent = vi.fn();
		await onMoveAccountForHonoApi({ config, db, publishInternalEvent }, src, dst);

		const updated = await fetchAntennaByIdOrFailFromDatabase(db, antennaId);
		expect(updated.users).toContain(`@${dst.username}@${dst.host}`);
	});
});
