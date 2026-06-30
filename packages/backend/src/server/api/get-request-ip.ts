/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { FastifyRequest } from 'fastify';

export function getRequestIp(request: FastifyRequest): string {
	return request.ip ?? request.socket.remoteAddress ?? '0.0.0.0';
}
