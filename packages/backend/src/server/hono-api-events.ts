/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { BroadcastTypes, DriveEventTypes, InternalEventTypes, MainEventTypes } from '@/core/GlobalEventService.js';
import type { MiUser } from '@/models/User.js';

export type HonoApiInternalEventPublisher = <K extends keyof InternalEventTypes>(
	type: K,
	value?: InternalEventTypes[K],
) => void;

export type HonoApiBroadcastStreamPublisher = <K extends keyof BroadcastTypes>(
	type: K,
	value?: unknown,
) => void;

export type HonoApiMainStreamPublisher = (
	userId: MiUser['id'],
	type: keyof MainEventTypes,
	value?: unknown,
) => void;

export type HonoApiDriveStreamPublisher = <K extends keyof DriveEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: DriveEventTypes[K],
) => void;
