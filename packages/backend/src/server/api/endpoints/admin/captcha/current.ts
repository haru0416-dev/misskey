/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { supportedCaptchaProviders } from '@/core/CaptchaLogic.js';
import { captchaCurrentParamDef } from '@/server/rest/captcha.js';

export const meta = {
	tags: ['admin', 'captcha'],

	requireCredential: true,
	requireAdmin: true,

	// 実態はmetaの取得であるため
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		properties: {
			provider: {
				type: 'string',
				enum: supportedCaptchaProviders,
			},
			hcaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
			mcaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
					instanceUrl: { type: 'string', nullable: true },
				},
			},
			recaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
			turnstile: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
		},
	},
} as const;

export const paramDef = captchaCurrentParamDef;
