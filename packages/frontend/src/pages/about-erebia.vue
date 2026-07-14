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
					<div :class="$style.tagline">{{ i18n.ts._aboutErebia.tagline }}</div>
					<div :class="$style.version">v{{ version }}</div>
				</div>

				<div :class="$style.description">
					{{ i18n.ts._aboutErebia.about }}
				</div>

				<MkInfo>{{ i18n.ts._aboutErebia.basedOnMisskey }}</MkInfo>

				<div v-if="$i != null" :class="$style.love">
					<MkButton primary rounded inline @click="iLoveErebia"><Mfm :text="i18n.ts._aboutErebia.love"/></MkButton>
				</div>

				<FormSection>
					<template #label>{{ i18n.ts._aboutErebia.values }}</template>
					<div :class="$style.values">
						<div :class="$style.value">
							<i class="ti ti-gauge" :class="$style.valueIcon"></i>
							<div>
								<div :class="$style.valueTitle">{{ i18n.ts._aboutErebia.performance }}</div>
								<div :class="$style.valueDescription">{{ i18n.ts._aboutErebia.performanceDescription }}</div>
							</div>
						</div>
						<div :class="$style.value">
							<i class="ti ti-shield-check" :class="$style.valueIcon"></i>
							<div>
								<div :class="$style.valueTitle">{{ i18n.ts._aboutErebia.reliability }}</div>
								<div :class="$style.valueDescription">{{ i18n.ts._aboutErebia.reliabilityDescription }}</div>
							</div>
						</div>
						<div :class="$style.value">
							<i class="ti ti-activity-heartbeat" :class="$style.valueIcon"></i>
							<div>
								<div :class="$style.valueTitle">{{ i18n.ts._aboutErebia.operations }}</div>
								<div :class="$style.valueDescription">{{ i18n.ts._aboutErebia.operationsDescription }}</div>
							</div>
						</div>
					</div>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts._aboutErebia.development }}</template>
					<div class="_gaps_s">
						<div :class="$style.developmentDescription">{{ i18n.ts._aboutErebia.developmentDescription }}</div>
						<FormLink to="https://github.com/haru0416-dev/misskey" external>
							<template #icon><i class="ti ti-code"></i></template>
							{{ i18n.ts._aboutErebia.source }}
							<template #suffix>GitHub</template>
						</FormLink>
						<FormLink to="https://github.com/haru0416-dev/misskey/releases" external>
							<template #icon><i class="ti ti-tag"></i></template>
							{{ i18n.ts._aboutErebia.releases }}
							<template #suffix>GitHub</template>
						</FormLink>
						<FormLink v-if="instance.providesTarball" :to="`/tarball/misskey-${version}.tar.gz`" external>
							<template #icon><i class="ti ti-download"></i></template>
							{{ i18n.ts._aboutErebia.source }}
							<template #suffix>Tarball</template>
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
	font-size: 1.25em;
	font-weight: 650;
	line-height: 1.4;
}

.tagline {
	margin-top: var(--MI-space-xs);
	font-weight: 550;
	color: var(--MI_THEME-accent);
}

.version {
	margin-top: var(--MI-space-xs);
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

.values {
	border: solid 1px var(--MI-border-muted);
	border-radius: var(--MI-radius-md);
	overflow: clip;
}

.value {
	display: flex;
	align-items: flex-start;
	gap: var(--MI-space-md);
	padding: var(--MI-space-lg);

	& + & {
		border-top: solid 1px var(--MI-border-muted);
	}
}

.valueIcon {
	flex: 0 0 auto;
	width: 36px;
	height: 36px;
	color: var(--MI_THEME-accent);
	font-size: 18px;
	line-height: 36px;
	text-align: center;
	background: var(--MI_THEME-accentedBg);
	border-radius: var(--MI-radius-sm);
}

.valueTitle {
	font-weight: 650;
}

.valueDescription,
.developmentDescription {
	margin-top: var(--MI-space-xs);
	color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
	line-height: 1.65;
	text-wrap: pretty;
}
</style>
