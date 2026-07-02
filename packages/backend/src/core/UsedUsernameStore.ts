/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { usedUsername } from '@/db/schema/used-username.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export async function isUsedUsername(db: MiDrizzleDatabase, username: string): Promise<boolean> {
	const [row] = await db
		.select({ username: usedUsername.username })
		.from(usedUsername)
		.where(eq(usedUsername.username, username.toLowerCase()))
		.limit(1);

	return row != null;
}
