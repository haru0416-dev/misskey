/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createRelayInDatabase, deleteRelayFromDatabase } from '@/core/relay/RelayStore.js';
import { relay } from '@/db/schema/relay.js';
import { genId } from '@/misc/id/gen-id.js';
import { relayAcceptedForApi, relayRejectedForApi } from '@/server/rest/admin/admin-relays.js';

describe('relay Accept / Reject', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	const statusOf = async (id: string) =>
		(await runtime.db.select({ status: relay.status }).from(relay).where(eq(relay.id, id)))[0]?.status;

	test('リレー自身の inbox から届いたときだけ状態を変える', async () => {
		const id = genId();
		const inbox = `https://relay-${id}.example/inbox`;
		await createRelayInDatabase(runtime.db, { id, inbox, status: 'requesting' });
		try {
			await relayAcceptedForApi(runtime, id, { inbox: 'https://someone.example/inbox', sharedInbox: null });
			await relayRejectedForApi(runtime, id, { inbox: null, sharedInbox: 'https://someone.example/shared' });
			expect(await statusOf(id)).toBe('requesting');

			await relayAcceptedForApi(runtime, id, { inbox: 'https://relay-actor.example/inbox', sharedInbox: inbox });
			expect(await statusOf(id)).toBe('accepted');
		} finally {
			await deleteRelayFromDatabase(runtime.db, id);
		}
	});
});
