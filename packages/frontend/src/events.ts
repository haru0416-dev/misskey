/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import type * as Misskey from 'misskey-js';
import { onBeforeUnmount } from 'vue';

type Events = {
	clientNotification: (notification: Misskey.entities.Notification) => void;
	notePosted: (note: Misskey.entities.Note) => void;
	noteDeleted: (noteId: Misskey.entities.Note['id']) => void;
	/** リモートで編集されたノートを取り直した。一覧は同じ ID のノート (リノート・返信の中も) を差し替える。 */
	noteEdited: (note: Misskey.entities.Note) => void;
	noteRemovedFromAntenna: (antennaId: Misskey.entities.Antenna['id'], noteId: Misskey.entities.Note['id']) => void;
	driveFileCreated: (file: Misskey.entities.DriveFile) => void;
	driveFilesUpdated: (files: Misskey.entities.DriveFile[]) => void;
	driveFilesDeleted: (files: Misskey.entities.DriveFile[]) => void;
	driveFoldersUpdated: (folders: Misskey.entities.DriveFolder[]) => void;
	driveFoldersDeleted: (folders: Misskey.entities.DriveFolder[]) => void;
};

export const globalEvents = new EventEmitter<Events>();

export function useGlobalEvent<T extends keyof Events>(
	event: T,
	callback: EventEmitter.EventListener<Events, T>,
): void {
	globalEvents.on(event, callback);
	onBeforeUnmount(() => {
		globalEvents.off(event, callback);
	});
}
