/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


export class MiInstance {
	public id: string;

	/**
	 * このインスタンスを捕捉した日時
	 */
	public firstRetrievedAt: Date;

	/**
	 * ホスト
	 */
	public host: string;

	/**
	 * インスタンスのユーザー数
	 */
	public usersCount: number;

	/**
	 * インスタンスの投稿数
	 */
	public notesCount: number;

	/**
	 * このインスタンスのユーザーからフォローされている、自インスタンスのユーザーの数
	 */
	public followingCount: number;

	/**
	 * このインスタンスのユーザーをフォローしている、自インスタンスのユーザーの数
	 */
	public followersCount: number;

	/**
	 * 直近のリクエスト受信日時
	 */
	public latestRequestReceivedAt: Date | null;

	/**
	 * このインスタンスと不通かどうか
	 */
	public isNotResponding: boolean;

	/**
	 * このインスタンスと不通になった日時
	 */
	public notRespondingSince: Date | null;

	/**
	 * このインスタンスへの配信状態
	 */
	public suspensionState: 'none' | 'manuallySuspended' | 'goneSuspended' | 'autoSuspendedForNotResponding';

	public softwareName: string | null;

	public softwareVersion: string | null;

	public openRegistrations: boolean | null;

	public name: string | null;

	public description: string | null;

	public maintainerName: string | null;

	public maintainerEmail: string | null;

	public iconUrl: string | null;

	public faviconUrl: string | null;

	public themeColor: string | null;

	public infoUpdatedAt: Date | null;

	public moderationNote: string;
}
