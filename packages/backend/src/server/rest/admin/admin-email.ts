/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { EmailService } from '@/core/email/EmailService.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiAdminEmailDependencies = {
	emailService: Pick<EmailService, 'sendEmail'>;
};

export const adminSendEmailParamDef = z.object({
	to: z.string(),
	subject: z.string(),
	text: z.string(),
});

export async function handleHonoApiAdminSendEmail(
	deps: HonoApiAdminEmailDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminSendEmailParamDef, body);
	await deps.emailService.sendEmail(params.to, params.subject, params.text, params.text);
}
