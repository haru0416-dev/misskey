/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

// API の型は opts の中身を一部しか持たない。ジョブの表示 (job.vue) は、BullMQ が返す repeat と attempts も使う。
export type QueueJob = Omit<Misskey.entities.QueueJob, 'opts'> & {
	opts: Misskey.entities.QueueJob['opts'] & {
		repeat?: unknown;
		attempts?: number;
	};
};
