/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MiInstance {
	public id: string;

	public firstRetrievedAt: Date;

	public host: string;

	public usersCount: number;

	public notesCount: number;

	public followingCount: number;

	public followersCount: number;

	public latestRequestReceivedAt: Date | null;

	public isNotResponding: boolean;

	public notRespondingSince: Date | null;

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
