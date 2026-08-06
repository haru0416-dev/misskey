/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { deleteDriveFileByIdInDatabase, updateDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';

export type DriveFileDeletionDependencies = {
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'enableChartsForFederatedInstances'>;
	deleteInternalFile: (key: string) => void;
	enqueueDeleteObjectStorageFile: (key: string) => unknown;
	updateDriveChart?: (file: MiDriveFile, isAdditional: boolean) => unknown;
	updatePerUserDriveChart?: (file: MiDriveFile, isAdditional: boolean) => unknown;
	updateInstanceDriveChart?: (file: MiDriveFile, isAdditional: boolean) => unknown;
	publishDriveStream?: ((userId: MiUser['id'], type: 'fileDeleted', value: MiDriveFile['id']) => void) | undefined;
	isModerator?: (user: MiUser) => Promise<boolean>;
	logDriveFileDeletion?: (
		deleter: MiUser,
		info: {
			fileId: MiDriveFile['id'];
			fileUserId: MiDriveFile['userId'];
			fileUserUsername: MiUser['username'] | null;
			fileUserHost: MiUser['host'] | null;
		},
	) => unknown;
};

async function postProcessDriveFileDeletion(
	deps: DriveFileDeletionDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<void> {
	// リモートファイル期限切れ削除後は直リンクにする
	if (isExpired && file.userHost !== null && file.uri != null) {
		await updateDriveFileInDatabase(deps.db, file.id, {
			isLink: true,
			url: file.uri,
			thumbnailUrl: null,
			webpublicUrl: null,
			storedInternal: false,
			// ローカルプロキシ用
			accessKey: randomUUID(),
			thumbnailAccessKey: 'thumbnail-' + randomUUID(),
			webpublicAccessKey: 'webpublic-' + randomUUID(),
		});
	} else {
		await deleteDriveFileByIdInDatabase(deps.db, file.id);
	}

	void deps.updateDriveChart?.(file, false);
	if (file.userHost == null) {
		// ローカルユーザーのみ
		void deps.updatePerUserDriveChart?.(file, false);
	} else if (deps.meta.enableChartsForFederatedInstances) {
		void deps.updateInstanceDriveChart?.(file, false);
	}

	if (file.userId) {
		deps.publishDriveStream?.(file.userId, 'fileDeleted', file.id);
	}

	if (
		deleter &&
		deps.isModerator != null &&
		deps.logDriveFileDeletion != null &&
		(await deps.isModerator(deleter)) &&
		file.userId !== deleter.id
	) {
		const user = file.userId ? await fetchUserByIdOrFailFromDatabase(deps.db, file.userId) : null;
		void deps.logDriveFileDeletion(deleter, {
			fileId: file.id,
			fileUserId: file.userId,
			fileUserUsername: user?.username ?? null,
			fileUserHost: user?.host ?? null,
		});
	}
}

export function startDriveFileDeletion(
	deps: DriveFileDeletionDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): void {
	// accessKey が null のレコード (異常データ) でリクエスト全体を落とさないよう null ガードする。
	// 原典はキュー経由の遅延削除だったため個別ファイルの失敗がレスポンスへ波及しなかった。
	if (file.storedInternal) {
		if (file.accessKey != null) deps.deleteInternalFile(file.accessKey);

		if (file.thumbnailUrl && file.thumbnailAccessKey != null) {
			deps.deleteInternalFile(file.thumbnailAccessKey);
		}

		if (file.webpublicUrl && file.webpublicAccessKey != null) {
			deps.deleteInternalFile(file.webpublicAccessKey);
		}
	} else if (!file.isLink) {
		if (file.accessKey != null) deps.enqueueDeleteObjectStorageFile(file.accessKey);

		if (file.thumbnailUrl && file.thumbnailAccessKey != null) {
			deps.enqueueDeleteObjectStorageFile(file.thumbnailAccessKey);
		}

		if (file.webpublicUrl && file.webpublicAccessKey != null) {
			deps.enqueueDeleteObjectStorageFile(file.webpublicAccessKey);
		}
	}

	void postProcessDriveFileDeletion(deps, file, isExpired, deleter);
}

export async function finishDriveFileDeletionSync(
	deps: DriveFileDeletionDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<void> {
	await postProcessDriveFileDeletion(deps, file, isExpired, deleter);
}
