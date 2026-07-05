/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { EmailService } from '@/core/EmailService.js';
import type { SystemWebhookDeliverQueue } from '@/core/QueueModule.js';
import { updateMetaInDatabase } from '@/core/MetaStore.js';
import { listUserProfilesByUserIdsFromDatabase } from '@/core/UserProfileStore.js';
import { listSystemWebhooksFromDatabase } from '@/core/SystemWebhookStore.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/SystemWebhookQueue.js';
import type { ModeratorInactivityRemainingTime, SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import { createAnnouncementWithSideEffects, type AnnouncementCreateValues } from '@/core/AnnouncementLogic.js';
import { genId } from '@/misc/id/gen-id.js';
import { getModeratorsForHonoApi } from '../../server/rest/admin-users.js';
import { packAnnouncementForHonoApi } from '../../server/rest/admin-announcements.js';
import type { HonoApiInternalEventPublisher, HonoApiMainStreamPublisher } from '../../server/rest/events.js';

export type HonoQueueCheckModeratorsActivityDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	emailService: Pick<EmailService, 'sendEmail'>;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

// モデレーターが不在と判断する日付の閾値
const MODERATOR_INACTIVITY_LIMIT_DAYS = 7;
// 警告通知やログ出力を行う残日数の閾値
const MODERATOR_INACTIVITY_WARNING_REMAINING_DAYS = 2;
// 期限から6時間ごとに通知を行う
const MODERATOR_INACTIVITY_WARNING_NOTIFY_INTERVAL_HOURS = 6;
const ONE_HOUR_MILLI_SEC = 1000 * 60 * 60;
const ONE_DAY_MILLI_SEC = ONE_HOUR_MILLI_SEC * 24;

type ModeratorInactivityEvaluationResult = {
	isModeratorsInactive: boolean;
	inactiveModerators: MiUser[];
	remainingTime: ModeratorInactivityRemainingTime;
};

function generateModeratorInactivityMail(remainingTime: ModeratorInactivityRemainingTime) {
	const subject = 'Moderator Inactivity Warning / モデレーター不在の通知';

	const timeVariant = remainingTime.asDays === 0 ? `${remainingTime.asHours} hours` : `${remainingTime.asDays} days`;
	const timeVariantJa = remainingTime.asDays === 0 ? `${remainingTime.asHours} 時間` : `${remainingTime.asDays} 日間`;
	const message = [
		'To Moderators,',
		'',
		`A moderator has been inactive for a period of time. If there are ${timeVariant} of inactivity left, it will switch to invitation only.`,
		'If you do not wish to move to invitation only, you must log into Misskey and update your last active date and time.',
		'',
		'---------------',
		'',
		'To モデレーター各位',
		'',
		`モデレーターが一定期間活動していないようです。あと${timeVariantJa}活動していない状態が続くと招待制に切り替わります。`,
		'招待制に切り替わることを望まない場合は、Misskeyにログインして最終アクティブ日時を更新してください。',
		'',
	];

	return { subject, html: message.join('<br>'), text: message.join('\n') };
}

function generateInvitationOnlyChangedMail() {
	const subject = 'Change to Invitation-Only / 招待制に変更されました';

	const message = [
		'To Moderators,',
		'',
		`Changed to invitation only because no moderator activity was detected for ${MODERATOR_INACTIVITY_LIMIT_DAYS} days.`,
		'To cancel the invitation only, you need to access the control panel.',
		'',
		'---------------',
		'',
		'To モデレーター各位',
		'',
		`モデレーターの活動が${MODERATOR_INACTIVITY_LIMIT_DAYS}日間検出されなかったため、招待制に変更されました。`,
		'招待制を解除するには、コントロールパネルにアクセスする必要があります。',
		'',
	];

	return { subject, html: message.join('<br>'), text: message.join('\n') };
}

async function fetchModeratorsForCheck(deps: HonoQueueCheckModeratorsActivityDependencies): Promise<MiUser[]> {
	// TODO: モデレーター以外にも特別な権限を持つユーザーがいる場合は考慮する
	return getModeratorsForHonoApi(deps, { includeAdmins: true, includeRoot: true, excludeExpire: true });
}

/** CheckModeratorsActivityProcessorService.evaluateModeratorsInactiveDays 相当。 */
async function evaluateModeratorsInactiveDays(deps: HonoQueueCheckModeratorsActivityDependencies): Promise<ModeratorInactivityEvaluationResult> {
	const today = new Date();
	const inactivePeriod = new Date(today);
	inactivePeriod.setDate(today.getDate() - MODERATOR_INACTIVITY_LIMIT_DAYS);

	const moderators = (await fetchModeratorsForCheck(deps)).filter(moderator => moderator.lastActiveDate != null);
	const inactiveModerators = moderators.filter(moderator => moderator.lastActiveDate!.getTime() < inactivePeriod.getTime());

	// 残りの猶予を示したいので、最終アクティブ日時が一番若いモデレータの日数を基準に猶予を計算する
	const newestLastActiveDate = new Date(Math.max(...moderators.map(moderator => moderator.lastActiveDate!.getTime())));
	const remainingTime = newestLastActiveDate.getTime() - inactivePeriod.getTime();

	return {
		isModeratorsInactive: inactiveModerators.length === moderators.length,
		inactiveModerators,
		remainingTime: {
			time: remainingTime,
			asHours: Math.floor(remainingTime / ONE_HOUR_MILLI_SEC),
			asDays: Math.floor(remainingTime / ONE_DAY_MILLI_SEC),
		},
	};
}

async function changeToInvitationOnly(deps: HonoQueueCheckModeratorsActivityDependencies): Promise<void> {
	const { before, after } = await updateMetaInDatabase(deps.db, { disableRegistration: true });
	Object.assign(deps.meta, after);
	deps.publishInternalEvent?.('metaUpdated', { before, after });
}

/** SystemWebhookService.enqueueSystemWebhook 相当。 */
async function enqueueCheckModeratorsActivitySystemWebhook<T extends SystemWebhookEventType>(
	deps: HonoQueueCheckModeratorsActivityDependencies,
	type: T,
	content: SystemWebhookPayload<T>,
): Promise<void> {
	const webhooks = await listSystemWebhooksFromDatabase(deps.db, { isActive: true, on: [type] });
	await Promise.all(webhooks.map(webhook => enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, webhook, type, content)));
}

/** CheckModeratorsActivityProcessorService.notifyInactiveModeratorsWarning 相当。 */
async function notifyInactiveModeratorsWarning(deps: HonoQueueCheckModeratorsActivityDependencies, remainingTime: ModeratorInactivityRemainingTime): Promise<void> {
	const moderators = await fetchModeratorsForCheck(deps);
	const moderatorProfiles = await listUserProfilesByUserIdsFromDatabase(deps.db, moderators.map(moderator => moderator.id))
		.then(profiles => new Map(profiles.map(profile => [profile.userId, profile])));

	const mail = generateModeratorInactivityMail(remainingTime);
	for (const moderator of moderators) {
		const profile = moderatorProfiles.get(moderator.id);
		if (profile && profile.email && profile.emailVerified) {
			void deps.emailService.sendEmail(profile.email, mail.subject, mail.html, mail.text);
		}
	}

	await enqueueCheckModeratorsActivitySystemWebhook(deps, 'inactiveModeratorsWarning', { remainingTime });
}

/** CheckModeratorsActivityProcessorService.notifyChangeToInvitationOnly 相当。 */
async function notifyChangeToInvitationOnly(deps: HonoQueueCheckModeratorsActivityDependencies): Promise<void> {
	const moderators = await fetchModeratorsForCheck(deps);
	const moderatorProfiles = await listUserProfilesByUserIdsFromDatabase(deps.db, moderators.map(moderator => moderator.id))
		.then(profiles => new Map(profiles.map(profile => [profile.userId, profile])));

	const mail = generateInvitationOnlyChangedMail();
	for (const moderator of moderators) {
		await createAnnouncementWithSideEffects({
			db: deps.db,
			genId: () => genId(deps.config),
			packAnnouncement: announcement => Promise.resolve(packAnnouncementForHonoApi(deps.config, announcement)),
			publishMainStream: (userId, type, value) => deps.publishMainStream?.(userId, type, value),
		}, {
			updatedAt: null,
			title: mail.subject,
			text: mail.text,
			imageUrl: null,
			icon: 'info',
			display: 'normal',
			forExistingUsers: true,
			silence: false,
			needConfirmationToRead: true,
			userId: moderator.id,
		} as AnnouncementCreateValues);

		const profile = moderatorProfiles.get(moderator.id);
		if (profile && profile.email && profile.emailVerified) {
			void deps.emailService.sendEmail(profile.email, mail.subject, mail.html, mail.text);
		}
	}

	await enqueueCheckModeratorsActivitySystemWebhook(deps, 'inactiveModeratorsInvitationOnlyChanged', {});
}

/** CheckModeratorsActivityProcessorService.process 相当。 */
export async function handleHonoQueueCheckModeratorsActivity(deps: HonoQueueCheckModeratorsActivityDependencies): Promise<void> {
	if (deps.meta.disableRegistration) return;

	const evaluateResult = await evaluateModeratorsInactiveDays(deps);
	if (evaluateResult.isModeratorsInactive) {
		await changeToInvitationOnly(deps);
		await notifyChangeToInvitationOnly(deps);
		return;
	}

	const remainingTime = evaluateResult.remainingTime;
	if (remainingTime.asDays <= MODERATOR_INACTIVITY_WARNING_REMAINING_DAYS) {
		if (remainingTime.asHours % MODERATOR_INACTIVITY_WARNING_NOTIFY_INTERVAL_HOURS === 0) {
			// ジョブの実行頻度と同等だと通知が多すぎるため期限から6時間ごとに通知する
			// つまり、のこり2日を切ったら6時間ごとに通知が送られる
			await notifyInactiveModeratorsWarning(deps, remainingTime);
		}
	}
}
