<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div style="text-align: center; padding: 0 16px;">{{ i18n.ts._initialTutorial._timeline.description1 }}</div>
	<div class="_gaps_s">
		<div v-for="tl in basicTimelineTypes">
			<i :class="basicTimelineIconClass(tl)"></i> <b>{{ i18n.ts._timelines[tl] }}</b> … {{ i18n.ts._initialTutorial._timeline[tl] }}
		</div>
	</div>
	<div class="_gaps_s">
		<div>{{ i18n.ts._initialTutorial._timeline.description2 }}</div>
		<img :class="$style.image" src="/client-assets/tutorial/timeline_tab.png" alt=""/>
	</div>
	<div :class="$style.divider"></div>
	<I18n :src="i18n.ts._initialTutorial._timeline.description3" tag="div" style="padding: 0 16px;">
		<template #link>
			<a href="https://misskey-hub.net/docs/for-users/features/timeline/" target="_blank" class="_link">{{ i18n.ts.help }}</a>
		</template>
	</I18n>
</div>
</template>

<script setup lang="ts">
import { i18n } from '@/i18n.js';
import { basicTimelineIconClass, basicTimelineTypes } from '@/timelines.js';
</script>

<style lang="scss" module>
.divider {
	height: 1px;
	background: var(--MI_THEME-divider);
}

.image {
	max-width: 300px;
	margin: 0 auto;
}
</style>
