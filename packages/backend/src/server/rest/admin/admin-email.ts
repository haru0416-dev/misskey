/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import type { EmailService } from '@/core/email/EmailService.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminEmailDependencies = {
	emailService: Pick<EmailService, 'sendEmail'>;
};

export const adminSendEmailParamDef = z.object({
	to: z.string(),
	subject: z.string(),
	text: z.string(),
});

export async function handleApiAdminSendEmail(
	deps: ApiAdminEmailDependencies,
	params: ApiParams<typeof adminSendEmailParamDef>,
): Promise<void> {
	await deps.emailService.sendEmail(params.to, params.subject, params.text, params.text);
}
