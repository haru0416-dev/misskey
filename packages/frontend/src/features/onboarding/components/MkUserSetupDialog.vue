<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="550"
	data-cy-user-setup
	@close="close(true)"
	@closed="emit('closed')"
	@esc="close(true)"
>
	<template v-if="page === 1" #header><i class="ti ti-user-edit" aria-hidden="true"></i> {{ i18n.ts._initialAccountSetting.profileSetting }}</template>
	<template v-else-if="page === 2" #header><i class="ti ti-lock" aria-hidden="true"></i> {{ i18n.ts._initialAccountSetting.privacySetting }}</template>
	<template v-else-if="page === 3" #header><i class="ti ti-user-plus" aria-hidden="true"></i> {{ i18n.ts.follow }}</template>
	<template v-else-if="page === 4" #header><i class="ti ti-bell-plus" aria-hidden="true"></i> {{ i18n.ts.pushNotification }}</template>
	<template v-else-if="page === 5" #header>{{ i18n.ts.done }}</template>
	<template v-else #header>{{ i18n.ts.initialAccountSetting }}</template>

	<div style="overflow-x: clip;" :inert="closing || savingPage" :aria-busy="closing || savingPage">
		<div :class="$style.progressBar" role="progressbar" :aria-label="i18n.ts.initialAccountSetting" aria-valuemin="0" aria-valuemax="5" :aria-valuenow="page">
			<div :class="$style.progressBarValue" :style="{ width: `${(page / 5) * 100}%` }"></div>
		</div>
		<Transition
			mode="out-in"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
			@after-enter="onAfterEnter"
		>
			<template v-if="page === 0">
				<div :class="$style.centerPage" tabindex="-1">
					<MkAnimBg style="position: absolute; top: 0;" :scale="1.5"/>
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-confetti" aria-hidden="true" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts._initialAccountSetting.accountCreated }}</div>
							<div>{{ i18n.ts._initialAccountSetting.letsStartAccountSetup }}</div>
							<MkButton primary rounded gradate style="margin: var(--MI-space-lg) auto 0 auto;" data-cy-user-setup-continue @click="page++">{{ i18n.ts._initialAccountSetting.profileSetting }} <i class="ti ti-arrow-right"></i></MkButton>
							<MkButton style="margin: 0 auto;" transparent rounded @click="later(true)">{{ i18n.ts.later }}</MkButton>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 1">
				<div :class="$style.scrollPage" tabindex="-1">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<XProfile/>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 2">
				<div :class="$style.scrollPage" tabindex="-1">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<XPrivacy/>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 3">
				<div :class="$style.scrollPage" tabindex="-1">
					<div :class="$style.pageRoot">
						<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;" :class="$style.pageMain">
							<XFollow/>
						</div>
						<div :class="$style.pageFooter">
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 4">
				<div :class="$style.centerPage" tabindex="-1">
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-bell-ringing-2" aria-hidden="true" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts.pushNotification }}</div>
							<div style="padding: 0 var(--MI-space-lg);">{{ i18n.tsx._initialAccountSetting.pushNotificationDescription({ name: instance.name ?? host }) }}</div>
							<MkPushNotificationAllowButton primary showOnlyToRegister style="margin: 0 auto;"/>
							<div class="_buttonsCenter" style="margin-top: var(--MI-space-lg);">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton primary rounded gradate data-cy-user-setup-continue @click="page++">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
			<template v-else-if="page === 5">
				<div :class="$style.centerPage" tabindex="-1">
					<MkAnimBg style="position: absolute; top: 0;" :scale="1.5"/>
					<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
						<div class="_gaps" style="text-align: center;">
							<i class="ti ti-check" aria-hidden="true" style="display: block; margin: auto; font-size: 3em; color: var(--MI_THEME-accent);"></i>
							<div style="font-size: 120%;">{{ i18n.ts._initialAccountSetting.initialAccountSettingCompleted }}</div>
							<div>{{ i18n.tsx._initialAccountSetting.youCanContinueTutorial({ name: instance.name ?? host }) }}</div>
							<div class="_buttonsCenter" style="margin-top: var(--MI-space-lg);">
								<MkButton rounded primary gradate data-cy-user-setup-continue @click="launchTutorial()">{{ i18n.ts._initialAccountSetting.startTutorial }} <i class="ti ti-arrow-right"></i></MkButton>
							</div>
							<div class="_buttonsCenter">
								<MkButton rounded data-cy-user-setup-back @click="page--"><i class="ti ti-arrow-left"></i> {{ i18n.ts.goBack }}</MkButton>
								<MkButton rounded data-cy-user-setup-continue @click="setupComplete()">{{ i18n.ts.close }}</MkButton>
							</div>
						</div>
					</div>
				</div>
			</template>
		</Transition>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, watch, nextTick } from 'vue';
import { host } from '@shared/utility/config.js';
import MkModalWindow from '@/components/overlay/MkModalWindow.vue';
import MkButton from '@/components/form/MkButton.vue';
import XProfile from '@/features/onboarding/components/MkUserSetupDialog.Profile.vue';
import XFollow from '@/features/onboarding/components/MkUserSetupDialog.Follow.vue';
import XPrivacy from '@/features/onboarding/components/MkUserSetupDialog.Privacy.vue';
import MkAnimBg from '@/components/display/MkAnimBg.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import MkPushNotificationAllowButton from '@/features/notifications/components/MkPushNotificationAllowButton.vue';
import { store } from '@/store.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const page = ref(store.accountSetupWizard);
const closing = ref(false);
const savingPage = ref(false);
let restoringPage = false;

// 各ステップの遷移完了後、入ったページのルート (tabindex=-1) へフォーカスを移し、
// スクリーンリーダーの読み上げ位置とキーボード操作の起点をステップ先頭へ復帰させる
function onAfterEnter(el: Element) {
	if (closing.value || savingPage.value) return;
	(el as HTMLElement).focus({ preventScroll: true });
}

watch(page, async (value, previousValue) => {
	if (closing.value || restoringPage) return;
	savingPage.value = true;
	try {
		await store.set('accountSetupWizard', value);
	} catch (error) {
		restoringPage = true;
		page.value = previousValue;
		store.$patch({ accountSetupWizard: previousValue });
		await store.$persistFlush().catch(rollbackError => console.error(rollbackError));
		await nextTick();
		restoringPage = false;
		console.error(error);
		await os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	} finally {
		savingPage.value = false;
	}
});

async function close(skip: boolean) {
	if (closing.value || savingPage.value) return;
	closing.value = true;
	if (skip) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts._initialAccountSetting.skipAreYouSure,
		});
		if (canceled) {
			closing.value = false;
			return;
		}
	}

	await persistAndClose(-1);
}

async function setupComplete(): Promise<boolean> {
	if (closing.value || savingPage.value) return false;
	closing.value = true;
	return persistAndClose(-1);
}

async function launchTutorial() {
	if (!await setupComplete()) return;
	nextTick(async () => {
		const { dispose } = await os.popupAsyncWithDialog(import('@/features/onboarding/components/MkTutorialDialog.vue').then(x => x.default), {
			initialPage: 1,
		}, {
			closed: () => dispose(),
		});
	});
}

async function later(defer: boolean) {
	if (closing.value || savingPage.value) return;
	closing.value = true;
	if (defer) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts._initialAccountSetting.laterAreYouSure,
		});
		if (canceled) {
			closing.value = false;
			return;
		}
	}

	await persistAndClose(0);
}

async function persistAndClose(value: number): Promise<boolean> {
	try {
		await store.set('accountSetupWizard', value);
		dialog.value?.close();
		return true;
	} catch (error) {
		store.$patch({ accountSetupWizard: page.value });
		await store.$persistFlush().catch(rollbackError => console.error(rollbackError));
		closing.value = false;
		console.error(error);
		await os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
		return false;
	}
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity var(--MI-duration-slow) var(--MI-ease-out), transform var(--MI-duration-slow) var(--MI-ease-out);
}
.transition_x_enterFrom {
	opacity: 0;
	transform: translateX(50px);
}
.transition_x_leaveTo {
	opacity: 0;
	transform: translateX(-50px);
}

.progressBar {
	position: absolute;
	top: 0;
	left: 0;
	z-index: 10;
	width: 100%;
	height: 4px;
}

.progressBarValue {
	height: 100%;
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
	transition: width 0.5s cubic-bezier(0,.5,.5,1);
}

.centerPage {
	display: flex;
	justify-content: center;
	align-items: safe center;
	height: 100cqh;
	padding-bottom: var(--MI-space-3xl);
	overflow: auto;
	box-sizing: border-box;

	&:focus {
		outline: none;
	}
}

.scrollPage {
	height: 100cqh;
	overflow: auto;

	&:focus {
		outline: none;
	}
}

.pageRoot {
	display: flex;
	flex-direction: column;
	min-height: 100%;
}

.pageMain {
	flex-grow: 1;
}

.pageFooter {
	position: sticky;
	bottom: 0;
	left: 0;
	flex-shrink: 0;
	padding: var(--MI-space-md);
	border-top: solid 0.5px var(--MI_THEME-divider);
	-webkit-backdrop-filter: blur(15px);
	backdrop-filter: blur(15px);
}

@media (prefers-reduced-motion: reduce) {
	.transition_x_enterActive,
	.transition_x_leaveActive {
		transition-duration: 0.01ms;
	}
	.transition_x_enterFrom,
	.transition_x_leaveTo {
		transform: none;
	}
	.progressBarValue {
		transition: none;
	}
}
</style>
