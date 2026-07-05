/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EmailService } from '@/core/EmailService.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminEmailDependencies = {
	emailService: Pick<EmailService, 'sendEmail'>;
};

const adminSendEmailParamDef = {
	type: 'object',
	properties: {
		to: { type: 'string' },
		subject: { type: 'string' },
		text: { type: 'string' },
	},
	required: ['to', 'subject', 'text'],
} as const;

type AdminSendEmailParams = SchemaType<typeof adminSendEmailParamDef>;

export async function handleHonoApiAdminSendEmail(
	deps: HonoApiAdminEmailDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminSendEmailParamDef, body) as AdminSendEmailParams;
	await deps.emailService.sendEmail(params.to, params.subject, params.text, params.text);
}
