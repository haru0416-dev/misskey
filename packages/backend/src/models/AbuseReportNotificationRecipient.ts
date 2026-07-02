/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiSystemWebhook } from '@/models/SystemWebhook.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUser } from './User.js';

/**
 * 通報受信時に通知を送信する方法.
 */
export type RecipientMethod = 'email' | 'webhook';

export class MiAbuseReportNotificationRecipient {
	public id: string;

	/**
	 * 有効かどうか.
	 */
	public isActive: boolean;

	/**
	 * 更新日時.
	 */
	public updatedAt: Date;

	/**
	 * 通知設定名.
	 */
	public name: string;

	/**
	 * 通知方法.
	 */
	public method: RecipientMethod;

	/**
	 * 通知先のユーザID.
	 */
	public userId: MiUser['id'] | null;

	/**
	 * 通知先のユーザ.
	 */
	public user: MiUser | null;

	/**
	 * 通知先のユーザプロフィール.
	 */
	public userProfile: MiUserProfile | null;

	/**
	 * 通知先のシステムWebhookId.
	 */
	public systemWebhookId: string | null;

	/**
	 * 通知先のシステムWebhook.
	 */
	public systemWebhook: MiSystemWebhook | null;
}
