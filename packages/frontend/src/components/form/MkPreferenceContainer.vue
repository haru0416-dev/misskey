<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @contextmenu.prevent.stop="showMenu($event, true)">
	<div :class="$style.body">
		<slot></slot>
	</div>
	<div :class="$style.menu">
		<i v-if="isSyncEnabled" class="ti ti-cloud-cog" style="color: var(--MI_THEME-accent); opacity: 0.7;"></i>
		<i v-if="isAccountOverrided" class="ti ti-user-cog" style="color: var(--MI_THEME-accent); opacity: 0.7;"></i>
		<button class="_button" :class="$style.menuButton" :aria-label="i18n.ts.menu" @click="showMenu($event)"><i class="ti ti-dots"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { PREF_DEF } from '@/preferences/def.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	k: keyof typeof PREF_DEF;
}>(), {
});

const isAccountOverrided = ref(prefer.isAccountOverrided(props.k));
const isSyncEnabled = ref(prefer.isSyncEnabled(props.k));
const menuDisposers = new Set<() => void>();
const activated = ref(true);
const routeActive = inject(DI.routeActive, ref(true));
function disposeMenus() {
	for (const dispose of menuDisposers) {
		dispose();
	}
}
onActivated(() => { activated.value = true; });
onDeactivated(() => {
	activated.value = false;
	disposeMenus();
});
onBeforeUnmount(disposeMenus);
watch(routeActive, (active) => {
	if (!active) {
		disposeMenus();
	}
}, { flush: 'sync' });

function showMenu(ev: PointerEvent, contextmenu?: boolean) {
	if (!activated.value || !routeActive.value) {
		return;
	}
	const menu = prefer.getPerPrefMenu(props.k);
	const stopStatusWatcher = watch([menu.overrideByAccount, menu.sync], ([overrideByAccount, sync]) => {
		isAccountOverrided.value = overrideByAccount;
		isSyncEnabled.value = sync;
	}, { immediate: true });
	let disposed = false;
	const dispose = () => {
		if (disposed) {
			return;
		}
		disposed = true;
		stopStatusWatcher();
		menu.dispose();
		menuDisposers.delete(dispose);
	};
	menuDisposers.add(dispose);

	if (contextmenu) {
		os.contextMenu(menu.items, ev).finally(dispose);
	} else {
		os.popupMenu(menu.items, ev.currentTarget ?? ev.target, {
			onClosing: dispose,
		}).finally(dispose);
	}
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: flex;

	&:hover {
		&::before {
			content: '';
			position: absolute;
			top: -8px;
			left: -8px;
			width: calc(100% + 16px);
			height: calc(100% + 16px);
			border-radius: 8px;
			background: light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.02));
			pointer-events: none;
		}

	}

	.body {
		flex: 1;
	}

	.menu {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-left: 12px;
		font-size: 12px;
		padding-left: 8px;
		border-left: solid 1px var(--MI_THEME-divider);

	}
}

/* 押せる範囲を 32px 四方にする。アイコンは文字色 70% で、Toneriko Light のパネルに対し 3.7 (アイコンに要る 3 以上) */
.menuButton {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	margin: -8px 0;
	border-radius: var(--MI-radius-md);
	color: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 70%);

	&:hover {
		color: var(--MI_THEME-fg);
	}
}
</style>
