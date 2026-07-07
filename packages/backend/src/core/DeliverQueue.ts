/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import type { DeliverQueue } from '@/core/queues.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { DeliverJobData, ThinUser } from '@/queue/types.js';

export function enqueueDeliverJob(
	queue: DeliverQueue,
	config: Pick<Config, 'deliverJobMaxAttempts'>,
	user: ThinUser,
	content: IActivity | null,
	to: string | null,
	isSharedInbox: boolean,
) {
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

	return queue.add(label, data, {
		attempts: config.deliverJobMaxAttempts ?? 12,
		backoff: {
			type: 'custom',
		},
		removeOnComplete: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 100,
		},
	});
}
