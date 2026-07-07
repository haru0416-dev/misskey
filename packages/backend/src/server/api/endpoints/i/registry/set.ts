/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { registrySetParamDef } from '@/server/rest/registry.js';

export const meta = {
	requireCredential: true,
	kind: 'write:account',
} as const;

export const paramDef = registrySetParamDef;
