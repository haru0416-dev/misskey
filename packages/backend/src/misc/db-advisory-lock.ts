/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export async function acquireAdvisoryTransactionLockInDatabase(
	db: Pick<MiDrizzleDatabase, 'execute'>,
	namespace: string,
	resourceId: string,
): Promise<void> {
	await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${resourceId}))`);
}
