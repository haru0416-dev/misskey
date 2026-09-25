<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.tabs, { [$style.centered]: props.centered }]" :style="{ '--tabAnchorName': tabAnchorName }">
	<div :class="$style.tabsInner">
		<button
			v-for="t in tabs"
			:ref="(el) => tabRefs[t.key] = (el as HTMLElement)"
			v-tooltip.noDelay="t.title"
			class="_button"
			:class="[$style.tab, {
				[$style.active]: t.key != null && t.key === tab,
				[$style.animate]: prefer.animation,
			}]"
			:style="getTabStyle(t)"
			@mousedown="(ev) => onTabMousedown(t, ev)"
			@click="(ev) => onTabClick(t, ev)"
		>
			<div :class="$style.tabInner">
				<i v-if="t.icon" :class="[$style.tabIcon, t.icon]"></i>
				<div
					v-if="!t.iconOnly || (!prefer.animation && t.key === tab)"
					:class="$style.tabTitle"
				>
					{{ t.title }}
				</div>
				<Transition
					v-else
					mode="in-out"
					@enter="enter"
					@afterEnter="afterEnter"
					@leave="leave"
					@afterLeave="afterLeave"
				>
					<div v-show="t.key === tab" :class="[$style.tabTitle, $style.animate]">{{ t.title }}</div>
				</Transition>
			</div>
		</button>
	</div>
	<div
		ref="tabHighlightEl"
		:class="[$style.tabHighlight, { [$style.animate]: prefer.animation, [$style.tabHighlightUpper]: tabHighlightUpper }]"
	></div>
</div>
</template>

<script lang="ts">
export type Tab<K = string> = {
	key: K;
	onClick?: (ev: PointerEvent) => void;
	iconOnly?: boolean;
	title: string;
	icon?: string;
};
</script>

<script lang="ts" setup generic="const T extends Tab">
import { onMounted, useTemplateRef } from 'vue';
import { prefer } from '@/preferences.js';
import { useTabHighlight } from '@/components/layout/tab-highlight.js';

const props = withDefaults(
	defineProps<{
		tabs?: T[];
		centered?: boolean;
		tabHighlightUpper?: boolean;
	}>(),
	{
		tabs: () => [] as T[],
	},
);

const emit = defineEmits<{
	(ev: 'tabClick', key: string): void;
}>();

const tab = defineModel<T['key'] | undefined>('tab');

const tabHighlightEl = useTemplateRef('tabHighlightEl');
const { tabAnchorName, tabRefs, getTabStyle, enter, afterEnter, leave, afterLeave, watchHighlight } = useTabHighlight({
	activeKey: () => tab.value,
	tabs: () => props.tabs,
	highlightEl: tabHighlightEl,
});

function onTabMousedown(selectedTab: Tab, ev: MouseEvent): void {
	// ユーザビリティの観点からmousedown時にはonClickは呼ばない
	if (selectedTab.key) {
		tab.value = selectedTab.key;
	}
}

function onTabClick(t: Tab, ev: PointerEvent): void {
	emit('tabClick', t.key);

	if (t.onClick) {
		ev.preventDefault();
		ev.stopPropagation();
		t.onClick(ev);
	}

	if (t.key) {
		tab.value = t.key;
	}
}

onMounted(() => {
	watchHighlight();
});
</script>

<style lang="scss" module>
.tabs {
	--height: 40px;

	display: block;
	position: relative;
	margin: 0;
	height: var(--height);
	font-size: 85%;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;

	&.centered {
		text-align: center;
	}
}

@container (max-width: 450px) {
	.tabs {
		font-size: 80%;
	}
}

.tabsInner {
	display: inline-block;
	height: var(--height);
	white-space: nowrap;
}

.tab {
	display: inline-block;
	position: relative;
	padding: 0 10px;
	height: 100%;
	font-weight: normal;
	opacity: 0.7;

	&:hover {
		opacity: 1;
	}

	&.active {
		opacity: 1;
	}

	&.animate {
		transition: opacity 0.2s ease;
	}
}

.tabInner {
	display: flex;
	align-items: center;
}

.tabIcon + .tabTitle {
	padding-left: 4px;
}

.tabTitle {
	overflow: hidden;

	&.animate {
		transition: width .15s linear, padding-left .15s linear;
	}
}

.tabHighlight {
	position: absolute;
	bottom: 0;
	height: 3px;
	background: var(--MI_THEME-accent);
	border-radius: 999px;
	transition: none;
	pointer-events: none;

	&.animate {
		transition: width 0.15s ease, left 0.15s ease;
	}

	&.tabHighlightUpper {
		top: 0;
		bottom: auto;
	}
}

@supports (position-anchor: --anchor-name) {
	.tabHighlight {
		left: anchor(var(--tabAnchorName) start);
		width: anchor-size(var(--tabAnchorName) width);
	}
}
</style>
