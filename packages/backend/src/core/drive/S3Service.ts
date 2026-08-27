/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';

/**
 * オブジェクトストレージへ書き込む 1 オブジェクト。
 * AWS SDK の PutObjectCommandInput の代わりに、実際に使う分だけを持つ。
 */
export type S3PutObject = {
	key: string;
	body: Blob | Uint8Array;
	contentType: string;
	contentDisposition?: string;
	publicRead: boolean;
};

export type S3DeleteObject = {
	key: string;
};

/** Google Cloud Storage は大きめのパートを推奨しているので、そこだけ分ける。 */
const GCS_PART_SIZE = 500 * 1024 * 1024;
const DEFAULT_PART_SIZE = 8 * 1024 * 1024;

function bucketOf(meta: MiMeta): string {
	const bucket = meta.objectStorageBucket;
	if (bucket == null || bucket === '') throw new Error('Object storage bucket is not configured');
	return bucket;
}

export function createS3Service() {
	function getS3Client(meta: MiMeta) {
		if (typeof Bun === 'undefined') throw new Error('Object storage requires the bun runtime');

		const bucket = bucketOf(meta);
		const scheme = meta.objectStorageUseSSL ? 'https' : 'http';
		// endpoint を指定したうえで仮想ホスト形式にする場合、バケットはホスト名側に付く。
		// Bun は endpoint を指定すると virtualHostedStyle でもホスト名を組み立て直さず、
		// バケットが URL から消えてしまうので、ここでホスト名に載せる。
		const virtualHostedStyle = meta.objectStorageEndpoint ? !meta.objectStorageS3ForcePathStyle : true;
		const endpoint = meta.objectStorageEndpoint
			? `${scheme}://${virtualHostedStyle ? `${bucket}.` : ''}${meta.objectStorageEndpoint}`
			: undefined;

		return new Bun.S3Client({
			bucket,
			...(endpoint == null ? {} : { endpoint }),
			...(meta.objectStorageAccessKey != null && meta.objectStorageSecretKey != null
				? { accessKeyId: meta.objectStorageAccessKey, secretAccessKey: meta.objectStorageSecretKey }
				: {}),
			// 空文字列も省略したいので ?? は使わない
			...(meta.objectStorageRegion ? { region: meta.objectStorageRegion } : {}),
			virtualHostedStyle,
		});
	}

	async function upload(meta: MiMeta, object: S3PutObject): Promise<void> {
		const client = getS3Client(meta);
		await client.write(object.key, object.body, {
			type: object.contentType,
			...(object.contentDisposition == null ? {} : { contentDisposition: object.contentDisposition }),
			...(object.publicRead ? { acl: 'public-read' as const } : {}),
			partSize: meta.objectStorageEndpoint === 'storage.googleapis.com' ? GCS_PART_SIZE : DEFAULT_PART_SIZE,
		});
	}

	async function del(meta: MiMeta, object: S3DeleteObject): Promise<void> {
		await getS3Client(meta).delete(object.key);
	}

	return { getS3Client, upload, delete: del };
}

export type S3Service = ReturnType<typeof createS3Service>;
