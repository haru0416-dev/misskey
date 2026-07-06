/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { z } from 'zod';

export const meta = {
	secure: true,
	requireCredential: true,
	limit: {
		duration: ms('1min'),
		max: 1,
	},
} as const;

export const paramDef = z.object({});
