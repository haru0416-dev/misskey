<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<nav ref="rootEl" :class="$style.root">
	<button type="button" :aria-label="i18n.ts.menu" :class="$style.item" class="_button" @click="drawerMenuShowing = true">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-menu-2"></i><span v-if="menuIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			<span :class="$style.itemLabel">{{ i18n.ts.menu }}</span>
		</div>
	</button>

	<button type="button" :aria-label="i18n.ts.timeline" :aria-current="isTimeline ? 'page' : undefined" :class="[$style.item, { [$style.active]: isTimeline }]" class="_button" @click="mainRouter.push('/')">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-home"></i>
			<span :class="$style.itemLabel">{{ i18n.ts.timeline }}</span>
		</div>
	</button>

	<button type="button" :aria-label="i18n.ts.notifications" :aria-current="isNotifications ? 'page' : undefined" :class="[$style.item, { [$style.active]: isNotifications }]" class="_button" @click="mainRouter.push('/my/notifications')">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-bell"></i>
			<span v-if="$i?.hasUnreadNotification" :class="$style.itemIndicator" class="_blink">
				<span class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ $i.unreadNotificationsCount > 99 ? '99+' : $i.unreadNotificationsCount }}</span>
			</span>
			<span :class="$style.itemLabel">{{ i18n.ts.notifications }}</span>
		</div>
	</button>

	<button type="button" :aria-label="i18n.ts.widgets" :class="$style.item" class="_button" @click="widgetsShowing = true">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-apps"></i>
			<span :class="$style.itemLabel">{{ i18n.ts.widgets }}</span>
		</div>
	</button>

	<button type="button" :aria-label="i18n.ts.note" :class="[$style.item, $style.post]" class="_button" @click="os.post()">
		<div :class="$style.itemInner">
			<i :class="$style.itemIcon" class="ti ti-pencil"></i>
			<span :class="$style.itemLabel">{{ i18n.ts.note }}</span>
		</div>
	</button>
</nav>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from 'vue';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { mainRouter } from '@/router.js';
import { navbarItemDef } from '@/navbar.js';
import { i18n } from '@/i18n.js';

const drawerMenuShowing = defineModel<boolean>('drawerMenuShowing');
const widgetsShowing = defineModel<boolean>('widgetsShowing');

const rootEl = useTemplateRef('rootEl');
const isTimeline = computed(() => mainRouter.currentRoute.value.path === '/');
const isNotifications = computed(() => mainRouter.currentRoute.value.path === '/my/notifications');

const menuIndicated = computed(() => {
	for (const [key, def] of Object.entries(navbarItemDef)) {
		if (key === 'notifications') continue; // 通知は下にボタンとして表示されてるから
		if (def.indicated) return true;
	}
	return false;
});

const rootElHeight = ref(0);

watch(rootEl, () => {
	if (rootEl.value) {
		rootElHeight.value = rootEl.value.offsetHeight;
		window.document.body.style.setProperty('--MI-minBottomSpacing', 'var(--MI-minBottomSpacingMobile)');
	} else {
		rootElHeight.value = 0;
		window.document.body.style.setProperty('--MI-minBottomSpacing', '0px');
	}
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	z-index: 1;
	padding-bottom: env(safe-area-inset-bottom, 0px);
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
	width: 100%;
	box-sizing: border-box;
	background: color(from var(--MI_THEME-navBg) srgb r g b / 0.94);
	color: var(--MI_THEME-navFg);
	border-top: solid 1px var(--MI-border-muted);
	-webkit-backdrop-filter: var(--MI-blur, blur(12px));
	backdrop-filter: var(--MI-blur, blur(12px));
}

.item {
	min-width: 0;
	padding: 7px 2px 6px;
	color: color-mix(in oklab, var(--MI_THEME-navFg) 72%, transparent);

	&.active {
		color: var(--MI_THEME-navActive);

		.itemInner {
			background: color-mix(in oklab, var(--MI_THEME-navActive) 15%, transparent);
		}
	}

	&.post {
		color: var(--MI_THEME-fgOnAccent);

		.itemInner {
			background: var(--MI_THEME-accent);
			color: var(--MI_THEME-fgOnAccent);

			&:hover {
				background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
			}

			&:active {
				background: hsl(from var(--MI_THEME-accent) h s calc(l - 5));
			}
		}
	}
}

.itemInner {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	width: min(100%, 58px);
	min-height: 44px;
	margin: auto;
	border-radius: var(--MI-radius-md);

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}

	&:active {
		background: var(--MI_THEME-panelHighlight);
	}
}

.itemIcon {
	font-size: 16px;
}

.itemLabel {
	max-width: 100%;
	padding: 0 3px;
	overflow: hidden;
	font-size: 9px;
	font-weight: 600;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.itemIndicator {
	position: absolute;
	top: 1px;
	right: 6px;
	color: var(--MI_THEME-indicator);
	font-size: 10px;
	pointer-events: none;

	&:has(.itemIndicateValueIcon) {
		animation: none;
		font-size: 8px;
	}
}
</style>
