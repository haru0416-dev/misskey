/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Serialized } from '@/types.js';

export const systemWebhookEventTypes = [
	// ユーザからの通報を受けたとき
	'abuseReport',
	// 通報を処理したとき
	'abuseReportResolved',
	// ユーザが作成された時
	'userCreated',
	// モデレータが一定期間不在である警告
	'inactiveModeratorsWarning',
	// モデレータが一定期間不在のためシステムにより招待制へと変更された
	'inactiveModeratorsInvitationOnlyChanged',
] as const;
export type SystemWebhookEventType = typeof systemWebhookEventTypes[number];

export class MiSystemWebhook {
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
	 * 最後に送信された日時.
	 */
	public latestSentAt: Date | null;

	/**
	 * 最後に送信されたステータスコード
	 */
	public latestStatus: number | null;

	/**
	 * 通知設定名.
	 */
	public name: string;

	/**
	 * イベント種別.
	 */
	public on: SystemWebhookEventType[];

	/**
	 * Webhook送信先のURL.
	 */
	public url: string;

	/**
	 * Webhook検証用の値.
	 */
	public secret: string;

	static deserialize(obj: Serialized<MiSystemWebhook>): MiSystemWebhook {
		return {
			...obj,
			updatedAt: new Date(obj.updatedAt),
			latestSentAt: obj.latestSentAt ? new Date(obj.latestSentAt) : null,
		};
	}
}
