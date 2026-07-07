/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationUpdateRemoteUserParamDef } from '@/server/rest/ap-person.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,
} as const;

export const paramDef = federationUpdateRemoteUserParamDef;
