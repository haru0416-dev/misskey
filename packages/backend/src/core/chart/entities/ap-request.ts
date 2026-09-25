/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const name = 'apRequest';

export const schema = {
	deliverFailed: {},
	deliverSucceeded: {},
	inboxReceived: {},
} as const;
