<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m">
				<div v-panel :class="$style.about">
					<img src="/client-assets/erebia-icon.svg" alt="" :class="$style.icon" draggable="false"/>
					<h1 :class="$style.name">Erebia</h1>
					<div :class="$style.version">v{{ version }}</div>
				</div>

				<div :class="$style.description">
					{{ i18n.ts._aboutErebia.about }}
				</div>

				<div v-if="$i != null" :class="$style.love">
					<MkButton primary rounded inline @click="iLoveErebia"><Mfm :text="i18n.ts._aboutErebia.love"/></MkButton>
				</div>

				<FormSection>
					<div class="_gaps_s">
						<FormLink to="https://github.com/haru0416-dev/misskey" external>
							<template #icon><i class="ti ti-code"></i></template>
							{{ i18n.ts._aboutErebia.source }}
							<template #suffix>GitHub</template>
						</FormLink>
						<FormLink v-if="instance.providesTarball" :to="`/tarball/misskey-${version}.tar.gz`" external>
							<template #icon><i class="ti ti-download"></i></template>
							{{ i18n.ts._aboutErebia.source }}
							<template #suffix>Tarball</template>
						</FormLink>
					</div>
				</FormSection>

				<FormSection>
					<div class="_gaps_s">
						<MkInfo>{{ i18n.ts._aboutErebia.basedOnMisskey }}</MkInfo>
						<FormLink to="/about-misskey">
							<template #icon><i class="ti ti-info-circle"></i></template>
							{{ i18n.ts.aboutMisskey }}
						</FormLink>
					</div>
				</FormSection>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { version } from '@shared/utility/config.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';

function iLoveErebia() {
	os.post({
		initialText: 'I $[jelly ❤] #Erebia',
		instant: true,
	});
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.aboutErebia,
	icon: null,
}));
</script>

<style lang="scss" module>
.about {
	padding: var(--MI-space-2xl);
	text-align: center;
	border-radius: var(--MI-radius-md);
}

.icon {
	display: block;
	width: 80px;
	margin: 0 auto;
	border-radius: var(--MI-radius-lg);
	box-shadow: var(--MI-shadow-sm);
}

.name {
	margin: var(--MI-space-md) 0 0;
	font-size: 1.15em;
	font-weight: 650;
	line-height: 1.4;
}

.version {
	color: color-mix(in oklab, var(--MI_THEME-fg) 58%, transparent);
}

.description {
	max-width: 65ch;
	margin: 0 auto;
	text-align: center;
	text-wrap: pretty;
}

.love {
	text-align: center;
}
</style>
