/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import type { EmailService } from '@/core/email/email-service.js';
import { parseApiParams } from '../validation.js';

export type AdminEmailDependencies = {
	emailService: Pick<EmailService, 'sendEmail'>;
};

export const adminSendEmailParamDef = z.object({
	to: z.string(),
	subject: z.string(),
	text: z.string(),
});

export async function handleApiAdminSendEmail(
	deps: AdminEmailDependencies,
	params: Params<typeof adminSendEmailParamDef>,
): Promise<void> {
	await deps.emailService.sendEmail(params.to, params.subject, params.text, params.text);
}
