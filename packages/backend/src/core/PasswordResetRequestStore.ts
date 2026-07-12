/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { passwordResetRequest, type PasswordResetRequestInsert, type PasswordResetRequestRow } from '@/db/schema/password-reset-request.js';
import { userProfile } from '@/db/schema/user-profile.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';

export async function createPasswordResetRequestInDatabase(db: MiDrizzleDatabase, data: PasswordResetRequestInsert): Promise<void> {
	await db
		.insert(passwordResetRequest)
		.values(data);
}

export async function fetchPasswordResetRequestByTokenFromDatabase(db: MiDrizzleDatabase, token: string): Promise<PasswordResetRequestRow> {
	const [row] = await db
		.select()
		.from(passwordResetRequest)
		.where(eq(passwordResetRequest.token, token))
		.limit(1);

	if (!row) {
		throw new Error('Password reset request was not found');
	}

	return row;
}

export async function consumePasswordResetRequestInDatabase(db: MiDrizzleDatabase, token: string, passwordHash: string): Promise<void> {
	await db.transaction(async tx => {
		const [request] = await tx
			.delete(passwordResetRequest)
			.where(eq(passwordResetRequest.token, token))
			.returning();

		if (!request) {
			throw new Error('Password reset request was not found');
		}
		if (Date.now() - parseId(request.id).date.getTime() > 1000 * 60 * 30) {
			throw new Error('Password reset request has expired');
		}

		await tx
			.update(userProfile)
			.set({ password: passwordHash })
			.where(eq(userProfile.userId, request.userId));
	});
}
