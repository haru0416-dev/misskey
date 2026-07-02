/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DriveEventTypes, InternalEventTypes } from '@/core/GlobalEventService.js';
import type { MiUser } from '@/models/User.js';

export type HonoApiInternalEventPublisher = <K extends keyof InternalEventTypes>(
	type: K,
	value?: InternalEventTypes[K],
) => void;

export type HonoApiDriveStreamPublisher = <K extends keyof DriveEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: DriveEventTypes[K],
) => void;
