<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkInfo v-if="$i && $i.hasUnreadAnnouncement && tab === 'current'" warn>{{ i18n.ts.youHaveUnreadAnnouncements }}</MkInfo>
			<MkPagination v-slot="{items}" :paginator="paginator" class="_gaps">
				<section v-for="announcement in items" :key="announcement.id" class="_panel" :class="[$style.announcement, { [$style.isRead]: $i != null && announcement.isRead }]">
					<div v-if="announcement.forYou" :class="$style.forYou"><i class="ti ti-pin" aria-hidden="true"></i> {{ i18n.ts.forYou }}</div>
					<div :class="$style.header">
						<span v-if="$i && !announcement.silence && !announcement.isRead" :class="$style.unreadDot" role="img" :aria-label="i18n.ts.unread"></span>
						<span :class="$style.typeIcon" aria-hidden="true">
							<i v-if="announcement.icon === 'info'" class="ti ti-info-circle"></i>
							<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i>
							<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);"></i>
							<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
						</span>
						<MkA :to="`/announcements/${announcement.id}`"><span>{{ announcement.title }}</span></MkA>
					</div>
					<div :class="$style.content">
						<Mfm :text="announcement.text" class="_selectable"/>
						<img v-if="announcement.imageUrl" :src="announcement.imageUrl" :alt="announcement.title"/>
						<MkA :to="`/announcements/${announcement.id}`">
							<div :class="$style.dates">
								<div>
									{{ i18n.ts.createdAt }}: <MkTime :time="announcement.createdAt" mode="detail"/>
								</div>
								<div v-if="announcement.updatedAt">
									{{ i18n.ts.updatedAt }}: <MkTime :time="announcement.updatedAt" mode="detail"/>
								</div>
							</div>
						</MkA>
					</div>
					<div :class="$style.reactions">
						<MkAnnouncementReactions :announcement="announcement" :readonly="tab === 'past'" @updated="(updated) => paginator.updateItem(updated.id, () => updated)"/>
					</div>
					<div v-if="tab !== 'past' && $i != null && !announcement.silence && !announcement.isRead" :class="$style.footer">
						<MkButton primary @click="read(announcement)"><i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts.gotIt }}</MkButton>
					</div>
				</section>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/layout/MkPagination.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import MkAnnouncementReactions from '@/features/announcements/components/MkAnnouncementReactions.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { Paginator } from '@/utility/paginator.js';

const paginator = markRaw(new Paginator('announcements', {
	limit: 10,
	computedParams: computed(() => ({
		isActive: tab.value === 'current',
	})),
}));

const tab = ref('current');

async function read(target: Misskey.entities.Announcement) {
	if ($i == null) return;

	if (target.needConfirmationToRead) {
		const confirm = await os.confirm({
			type: 'question',
			title: i18n.ts._announcement.readConfirmTitle,
			text: i18n.tsx._announcement.readConfirmText({ title: target.title }),
		});
		if (confirm.canceled) return;
	}

	paginator.updateItem(target.id, a => ({
		...a,
		isRead: true,
	}));
	misskeyApi('i/read-announcement', { announcementId: target.id });
	updateCurrentAccountPartial({
		unreadAnnouncements: $i.unreadAnnouncements.filter(a => a.id !== target.id),
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'current',
	title: i18n.ts.currentAnnouncements,
	icon: 'ti ti-flare',
}, {
	key: 'past',
	title: i18n.ts.pastAnnouncements,
	icon: 'ti ti-point',
}]);

definePage(() => ({
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}));
</script>

<style lang="scss" module>
.announcement {
	padding: var(--MI-space-lg);
}

.isRead {
	.header {
		opacity: 0.75;
	}
}

.forYou {
	display: flex;
	align-items: center;
	line-height: 24px;
	font-size: 90%;
	white-space: pre;
	color: var(--MI_THEME-warn);
}

.header {
	margin-bottom: var(--MI-space-lg);
	font-weight: bold;
}

.unreadDot {
	display: inline-block;
	width: 8px;
	height: 8px;
	margin-right: var(--MI-space-sm);
	border-radius: var(--MI-radius-full);
	background: var(--MI_THEME-indicator);
	vertical-align: middle;
}

.typeIcon {
	margin-right: 0.5em;
}

.content {
	> img {
		display: block;
		max-height: 300px;
		max-width: 100%;
		border-radius: var(--MI-radius-md);
		margin-top: var(--MI-space-sm);
	}
}

.dates {
	margin-top: var(--MI-space-sm);
	opacity: 0.7;
	font-size: 85%;
}

.reactions {
	margin-top: var(--MI-space-lg);
}

.footer {
	margin-top: var(--MI-space-lg);
}
</style>
