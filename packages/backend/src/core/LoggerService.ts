/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Logger from '@/logger.js';
import type { Keyword } from 'color-convert';

export function createLoggerService() {
	function getLogger(domain: string, color?: Keyword | undefined) {
		return new Logger(domain, color);
	}

	return { getLogger };
}

export type LoggerService = ReturnType<typeof createLoggerService>;
