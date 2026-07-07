/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { swShowRegistrationParamDef } from '@/server/rest/sw.js';

export const meta = {
	tags: ['account'],

	requireCredential: false,

	description: 'Unregister from receiving push notifications.',
} as const;

export const paramDef = swShowRegistrationParamDef;
