/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiUser } from './User.js';

export type RecipientMethod = 'email' | 'webhook';

export class MiAbuseReportNotificationRecipient {
	public id: string;

	public isActive: boolean;

	public updatedAt: Date;

	public name: string;

	public method: RecipientMethod;

	public userId: MiUser['id'] | null;

	public user: MiUser | null;

	public userProfile: MiUserProfile | null;

	public systemWebhookId: string | null;

	public systemWebhook: MiSystemWebhook | null;
}
