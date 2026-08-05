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

export const PASSWORD_RESET_REQUEST_EXPIRY_MS = 1000 * 60 * 30;

export function isPasswordResetRequestExpired(request: PasswordResetRequestRow): boolean {
	return Date.now() - parseId(request.id).date.getTime() > PASSWORD_RESET_REQUEST_EXPIRY_MS;
}

export async function fetchPasswordResetRequestByTokenFromDatabase(db: MiDrizzleDatabase, token: string): Promise<PasswordResetRequestRow | null> {
	const [row] = await db
		.select()
		.from(passwordResetRequest)
		.where(eq(passwordResetRequest.token, token))
		.limit(1);

	return row ?? null;
}

/** 存在しない・期限切れのトークンは利用者側の事情なので、例外ではなく結果として返す (呼び出し元がAPIエラーへ変換する) */
export type ConsumePasswordResetRequestResult = 'ok' | 'notFound' | 'expired';

export async function consumePasswordResetRequestInDatabase(db: MiDrizzleDatabase, token: string, passwordHash: string): Promise<ConsumePasswordResetRequestResult> {
	return await db.transaction(async tx => {
		const [request] = await tx
			.delete(passwordResetRequest)
			.where(eq(passwordResetRequest.token, token))
			.returning();

		if (!request) return 'notFound';
		// 期限切れのトークンは二度と使えないので、消えたままで構わない
		if (isPasswordResetRequestExpired(request)) return 'expired';

		await tx
			.update(userProfile)
			.set({ password: passwordHash })
			.where(eq(userProfile.userId, request.userId));

		return 'ok';
	});
}
