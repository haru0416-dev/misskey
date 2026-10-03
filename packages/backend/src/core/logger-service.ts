/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createLogger } from '@/logger.js';
import type { LogColor } from '@/logger.js';

export function createLoggerService() {
	function getLogger(domain: string, color?: LogColor | undefined) {
		return createLogger(domain, color);
	}

	return { getLogger };
}

export type LoggerService = ReturnType<typeof createLoggerService>;
