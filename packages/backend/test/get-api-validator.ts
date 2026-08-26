/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { z } from 'zod';

export const getValidator = (paramDef: z.ZodType) => {
	return (data: unknown): boolean => paramDef.safeParse(data).success;
};
