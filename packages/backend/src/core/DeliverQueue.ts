/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import { addDeliverJob, type DeliverJobInput, type DeliverQueue } from '@/core/queues.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { DeliverJobData, ThinUser } from '@/queue/types.js';
import { queueRetentionOptions } from '@/queue/const.js';

export function createDeliverJob(
	config: Pick<Config, 'queues'>,
	user: ThinUser,
	content: IActivity | null,
	to: string | null,
	isSharedInbox: boolean,
): DeliverJobInput | null {
	if (content == null) return null;
	if (to == null) return null;

	const contentBody = JSON.stringify(content);
	const digest = ApRequestCreator.createDigest(contentBody);
	const data: DeliverJobData = {
		user: {
			id: user.id,
		},
		content: contentBody,
		digest,
		to,
		isSharedInbox,
	};
	const label = to.replace('https://', '').replace('/inbox', '');

	return {
		name: label,
		data,
		opts: {
			attempts: config.queues.deliver.maximumAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			...queueRetentionOptions(config),
		},
	};
}

export function enqueueDeliverJob(
	queue: DeliverQueue,
	config: Pick<Config, 'queues'>,
	user: ThinUser,
	content: IActivity | null,
	to: string | null,
	isSharedInbox: boolean,
) {
	const job = createDeliverJob(config, user, content, to, isSharedInbox);
	return job == null ? null : addDeliverJob(queue, job);
}
