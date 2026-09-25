/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type {
	AbuseReportPayload,
	InactiveModeratorsWarningPayload,
	SystemWebhookPayload,
} from '@/core/webhook/system-webhook-types.js';
import type { MiAbuseUserReport } from '@/models/_.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import {
	packWebhookTestUserLite,
	webhookTestDummyUser1,
	webhookTestDummyUser2,
	webhookTestDummyUser3,
} from '@/core/webhook/webhook-test-dummies.js';
import type { PopulateWebhookTestEmojis } from '@/core/webhook/webhook-test-dummies.js';

type PopulateDummyEmojis = PopulateWebhookTestEmojis;

export type SystemWebhookTestDependencies = {
	fetchSystemWebhooksByIds: (ids: MiSystemWebhook['id'][]) => Promise<MiSystemWebhook[]>;
	enqueueSystemWebhookDeliver: <T extends SystemWebhookEventType>(
		webhook: MiSystemWebhook,
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: { attempts?: number },
	) => void | Promise<unknown>;
	populateEmojis: PopulateDummyEmojis;
};

export class NoSuchSystemWebhookForTestError extends Error {}

async function generateSystemWebhookTestAbuseReport(
	populateEmojis: PopulateDummyEmojis,
	override?: Partial<MiAbuseUserReport>,
): Promise<AbuseReportPayload> {
	const result: MiAbuseUserReport = {
		id: 'dummy-abuse-report1',
		targetUserId: 'dummy-target-user',
		targetUser: null,
		reporterId: 'dummy-reporter-user',
		reporter: null,
		assigneeId: null,
		assignee: null,
		resolved: false,
		forwarded: false,
		comment: 'This is a dummy report for testing purposes.',
		targetUserHost: null,
		reporterHost: null,
		resolvedAs: null,
		moderationNote: 'foo',
		...override,
	};

	return {
		...result,
		targetUser: result.targetUser ? await packWebhookTestUserLite(populateEmojis, result.targetUser) : null,
		reporter: result.reporter ? await packWebhookTestUserLite(populateEmojis, result.reporter) : null,
		assignee: result.assignee ? await packWebhookTestUserLite(populateEmojis, result.assignee) : null,
	};
}

async function createSystemWebhookTestPayload<T extends SystemWebhookEventType>(
	populateEmojis: PopulateDummyEmojis,
	type: T,
): Promise<SystemWebhookPayload<T>> {
	switch (type) {
		case 'abuseReport': {
			return (await generateSystemWebhookTestAbuseReport(populateEmojis, {
				targetUserId: webhookTestDummyUser1.id,
				targetUser: webhookTestDummyUser1,
				reporterId: webhookTestDummyUser2.id,
				reporter: webhookTestDummyUser2,
			})) as SystemWebhookPayload<T>;
		}
		case 'abuseReportResolved': {
			return (await generateSystemWebhookTestAbuseReport(populateEmojis, {
				targetUserId: webhookTestDummyUser1.id,
				targetUser: webhookTestDummyUser1,
				reporterId: webhookTestDummyUser2.id,
				reporter: webhookTestDummyUser2,
				assigneeId: webhookTestDummyUser3.id,
				assignee: webhookTestDummyUser3,
				resolved: true,
			})) as SystemWebhookPayload<T>;
		}
		case 'userCreated': {
			return (await packWebhookTestUserLite(populateEmojis, webhookTestDummyUser1)) as SystemWebhookPayload<T>;
		}
		case 'inactiveModeratorsWarning': {
			const dummyTime: InactiveModeratorsWarningPayload['remainingTime'] = {
				time: 100_000,
				asDays: 1,
				asHours: 24,
			};

			return {
				remainingTime: dummyTime,
			} as SystemWebhookPayload<T>;
		}
		case 'inactiveModeratorsInvitationOnlyChanged': {
			return {} as SystemWebhookPayload<T>;
		}
		default: {
			const _exhaustiveAssertion: never = type;
			return _exhaustiveAssertion;
		}
	}
}

export async function testSystemWebhookWithQueue<T extends SystemWebhookEventType>(
	deps: SystemWebhookTestDependencies,
	params: {
		webhookId: MiSystemWebhook['id'];
		type: T;
		override?: Partial<Omit<MiSystemWebhook, 'id'>>;
	},
): Promise<void> {
	const webhooks = await deps.fetchSystemWebhooksByIds([params.webhookId]);
	if (webhooks.length === 0) {
		throw new NoSuchSystemWebhookForTestError();
	}
	const storedWebhook = webhooks[0];
	if (storedWebhook == null) {
		throw new NoSuchSystemWebhookForTestError();
	}

	const webhook = {
		...storedWebhook,
		...params.override,
	};
	const payload = await createSystemWebhookTestPayload(deps.populateEmojis, params.type);

	void deps.enqueueSystemWebhookDeliver(webhook, params.type, payload, { attempts: 1 });
}
