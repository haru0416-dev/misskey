/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MiRelay {
	public id: string;

	public inbox: string;

	public status: 'requesting' | 'accepted' | 'rejected';
}
