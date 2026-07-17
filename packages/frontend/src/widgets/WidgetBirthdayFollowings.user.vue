<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkA :to="userPage(item.user)" :class="$style.link">
		<MkUserCardMini :user="item.user" :withChart="false" style="background: inherit; border-radius: unset;">
			<template #sub>
				<span>{{ countdownDate }}</span>
				<span> / </span>
				<span class="_monospace">@{{ acct(item.user) }}</span>
			</template>
		</MkUserCardMini>
	</MkA>
	<button v-tooltip.noDelay="i18n.ts.note" class="_button" :class="$style.post" :aria-label="i18n.ts.note" @click="os.post({initialText: `@${item.user.username}${item.user.host ? `@${item.user.host}` : ''} `})">
		<i class="ti-fw ti ti-confetti" :class="$style.postIcon"></i>
	</button>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkUserCardMini from '@/features/users/components/MkUserCardMini.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useLowresTime } from '@/composables/useLowresTime.js';
import { userPage, acct } from '@/filters/user.js';

const props = defineProps<{
	item: Misskey.entities.UsersGetFollowingUsersByBirthdayResponse[number];
}>();

const now = useLowresTime();
const nowDate = computed(() => {
	const date = new Date(now.value);
	date.setHours(0, 0, 0, 0);
	return date;
});
const birthdayDate = computed(() => {
	const parts = props.item.birthday.split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	return new Date(year, month - 1, day, 0, 0, 0, 0);
});

const countdownDate = computed(() => {
	const days = Math.floor((birthdayDate.value.getTime() - nowDate.value.getTime()) / (1000 * 60 * 60 * 24));
	if (days === 0) {
		return i18n.ts.today;
	} else if (days > 0) {
		return i18n.tsx._timeIn.days({ n: days });
	} else {
		return i18n.tsx._ago.daysAgo({ n: Math.abs(days) });
	}
});
</script>

<style lang="scss" module>
.root {
	box-sizing: border-box;
	display: grid;
	align-items: center;
	grid-template-columns: minmax(0, 1fr) 56px;
}

.link {
	overflow: clip;
}

.post {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 40px;
	width: 40px;
	margin-right: var(--MI-space-lg);
	aspect-ratio: 1/1;
	border-radius: var(--MI-radius-full);
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));

	&:hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
	}
}

.postIcon {
	color: var(--MI_THEME-fgOnAccent);
}
</style>
