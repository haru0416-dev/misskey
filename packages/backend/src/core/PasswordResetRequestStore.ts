/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { passwordResetRequest, type PasswordResetRequestInsert, type PasswordResetRequestRow } from '@/db/schema/password-reset-request.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

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

export async function deletePasswordResetRequestFromDatabase(db: MiDrizzleDatabase, id: PasswordResetRequestRow['id']): Promise<void> {
	await db
		.delete(passwordResetRequest)
		.where(eq(passwordResetRequest.id, id));
}
