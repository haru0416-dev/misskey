<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.iconOnly]: iconOnly }]">
	<div :class="$style.body">
		<div :class="$style.top">
			<button v-tooltip.noDelay.right="instance.name ?? i18n.ts.instance" :aria-label="instance.name ?? i18n.ts.instance" class="_button" :class="$style.instance" @click="openInstanceMenu">
				<img :src="instance.iconUrl || '/client-assets/erebia-icon.svg'" alt="" :class="$style.instanceIcon" style="view-transition-name: navbar-serverIcon;"/>
			</button>
			<button v-if="!iconOnly" v-tooltip.noDelay.right="i18n.ts.realtimeMode" :aria-label="i18n.ts.realtimeMode" class="_button" :class="[$style.topAction, $style.realtimeMode, store.realtimeMode ? $style.on : null]" @click="toggleRealtimeMode">
				<i v-if="store.realtimeMode" class="ti ti-bolt ti-fw"></i>
				<i v-else class="ti ti-bolt-off ti-fw"></i>
			</button>
			<button v-if="!iconOnly && showWidgetButton" v-tooltip.noDelay.right="i18n.ts.widgets" :aria-label="i18n.ts.widgets" class="_button" :class="$style.topAction" @click="() => emit('widgetButtonClick')">
				<i class="ti ti-apps ti-fw"></i>
			</button>
			<button v-if="!iconOnly && prefer.showNavbarSubButtons" v-tooltip.noDelay.right="i18n.ts.edit" :aria-label="i18n.ts.edit" class="_button" :class="$style.topAction" @click="menuEdit">
				<i class="ti ti-settings-2 ti-fw"></i>
			</button>
			<button v-if="!props.asDrawer && prefer.showNavbarSubButtons && (!iconOnly || !forceIconOnly)" v-tooltip.noDelay.right="iconOnly ? i18n.ts.show : i18n.ts.hide" :aria-label="iconOnly ? i18n.ts.show : i18n.ts.hide" :aria-expanded="!iconOnly" class="_button" :class="iconOnly ? $style.navExpand : $style.topAction" @click="toggleIconOnly">
				<i v-if="iconOnly" class="ti ti-chevron-right ti-fw"></i>
				<i v-else class="ti ti-chevron-left ti-fw"></i>
			</button>
		</div>
		<div :class="$style.middle">
			<MkA v-tooltip.noDelay.right="iconOnly ? i18n.ts.timeline : null" :class="$style.item" :activeClass="$style.active" to="/" exact>
				<i :class="$style.itemIcon" class="ti ti-home ti-fw" style="view-transition-name: navbar-homeIcon;"></i><span :class="$style.itemText">{{ i18n.ts.timeline }}</span>
			</MkA>
			<template v-for="item in prefer.menu">
				<div v-if="item === '-'" :class="$style.divider"></div>
				<component
					:is="navbarItemDef[item].to ? 'MkA' : 'button'"
					v-else-if="navbarItemDef[item] && (navbarItemDef[item].show == null || navbarItemDef[item].show.value !== false)"
					v-tooltip.noDelay.right="iconOnly ? navbarItemDef[item].title : null"
					class="_button"
					:class="[$style.item]"
					:activeClass="$style.active"
					:to="navbarItemDef[item].to"
					v-on="navbarItemDef[item].action ? { click: navbarItemDef[item].action } : {}"
				>
					<i class="ti-fw" :class="[$style.itemIcon, navbarItemDef[item].icon]" :style="{ viewTransitionName: 'navbar-item-' + item }"></i><span :class="$style.itemText">{{ navbarItemDef[item].title }}</span>
					<span v-if="navbarItemDef[item].indicated" :class="$style.itemIndicator" class="_blink">
						<span v-if="navbarItemDef[item].indicateValue" class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ navbarItemDef[item].indicateValue }}</span>
						<i v-else class="_indicatorCircle"></i>
					</span>
				</component>
			</template>
			<div :class="$style.divider"></div>
			<MkA v-if="$i != null && ($i.isAdmin || $i.isModerator)" v-tooltip.noDelay.right="iconOnly ? i18n.ts.controlPanel : null" :class="$style.item" :activeClass="$style.active" to="/admin">
				<i :class="$style.itemIcon" class="ti ti-dashboard ti-fw" style="view-transition-name: navbar-controlPanel;"></i><span :class="$style.itemText">{{ i18n.ts.controlPanel }}</span>
			</MkA>
			<button class="_button" :class="$style.item" @click="more">
				<i :class="$style.itemIcon" class="ti ti-grid-dots ti-fw" style="view-transition-name: navbar-more;"></i><span :class="$style.itemText">{{ i18n.ts.more }}</span>
				<span v-if="otherMenuItemIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</button>
			<MkA v-tooltip.noDelay.right="iconOnly ? i18n.ts.settings : null" :class="$style.item" :activeClass="$style.active" to="/settings">
				<i :class="$style.itemIcon" class="ti ti-settings ti-fw" style="view-transition-name: navbar-settings;"></i><span :class="$style.itemText">{{ i18n.ts.settings }}</span>
			</MkA>
		</div>
		<div :class="$style.bottom">
			<button v-if="iconOnly && showWidgetButton" v-tooltip.noDelay.right="i18n.ts.widgets" :aria-label="i18n.ts.widgets" class="_button" :class="[$style.widget]" @click="() => emit('widgetButtonClick')">
				<i class="ti ti-apps ti-fw"></i>
			</button>
			<button v-if="iconOnly" v-tooltip.noDelay.right="i18n.ts.realtimeMode" :aria-label="i18n.ts.realtimeMode" class="_button" :class="[$style.realtimeMode, store.realtimeMode ? $style.on : null]" @click="toggleRealtimeMode">
				<i v-if="store.realtimeMode" class="ti ti-bolt ti-fw"></i>
				<i v-else class="ti ti-bolt-off ti-fw"></i>
			</button>
			<button v-tooltip.noDelay.right="iconOnly ? i18n.ts.note : null" class="_button" :class="[$style.post]" data-cy-open-post-form @click="() => { os.post(); }">
				<i class="ti ti-pencil ti-fw" :class="$style.postIcon"></i><span :class="$style.postText">{{ i18n.ts.note }}</span>
			</button>
			<button v-if="$i != null" v-tooltip.noDelay.right="iconOnly ? `${i18n.ts.account}: @${$i.username}` : null" class="_button" :class="[$style.account]" @click="openAccountMenu">
				<MkAvatar :user="$i" :class="$style.avatar" style="view-transition-name: navbar-avatar;"/><MkAcct class="_nowrap" :class="$style.acct" :user="$i"/>
			</button>
		</div>
	</div>

</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { openInstanceMenu } from './common.js';
import * as os from '@/os.js';
import { navbarItemDef } from '@/navbar.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { useRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import { getAccountMenu } from '@/accounts.js';
import { $i } from '@/i.js';
import { runViewTransition } from '@/utility/view-transition.js';

const router = useRouter();

const props = defineProps<{
	showWidgetButton?: boolean;
	asDrawer?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'widgetButtonClick'): void;
}>();

const forceIconOnly = ref(!props.asDrawer && window.innerWidth <= 1279);
const iconOnly = computed(() => {
	return !props.asDrawer && (forceIconOnly.value || (store.menuDisplay === 'sideIcon'));
});

const otherMenuItemIndicated = computed(() => {
	for (const [key, def] of Object.entries(navbarItemDef)) {
		if (prefer.menu.includes(key)) continue;
		if (def.indicated) return true;
	}
	return false;
});

function calcViewState() {
	forceIconOnly.value = !props.asDrawer && window.innerWidth <= 1279;
}

window.addEventListener('resize', calcViewState);

watch(() => store.menuDisplay, () => {
	calcViewState();
});

function toggleIconOnly() {
	if (prefer.animation) {
		runViewTransition(() => {
			store.set('menuDisplay', iconOnly.value ? 'sideFull' : 'sideIcon');
		});
	} else {
		store.set('menuDisplay', iconOnly.value ? 'sideFull' : 'sideIcon');
	}
}

function toggleRealtimeMode(ev: PointerEvent) {
	os.popupMenu([{
		type: 'label',
		text: i18n.ts.realtimeMode,
	}, {
		text: store.realtimeMode ? i18n.ts.turnItOff : i18n.ts.turnItOn,
		icon: store.realtimeMode ? 'ti ti-bolt-off' : 'ti ti-bolt',
		action: () => {
			store.set('realtimeMode', !store.realtimeMode);
			window.location.reload();
		},
	}], ev.currentTarget ?? ev.target);
}

async function openAccountMenu(ev: PointerEvent) {
	const menuItems = await getAccountMenu({
		withExtraOperation: true,
	});

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

async function more(ev: PointerEvent) {
	const target = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!target) return;
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/overlay/MkLaunchPad.vue').then(x => x.default), {
		anchorElement: target,
	}, {
		closed: () => dispose(),
	});
}

function menuEdit() {
	router.push('/settings/navbar');
}
</script>

<style lang="scss" module>
.root {
	--nav-width: 248px;
	--nav-icon-only-width: 72px;

	flex: 0 0 var(--nav-width);
	width: var(--nav-width);
	box-sizing: border-box;
}

.body {
	position: relative;
	width: var(--nav-icon-only-width);
	height: 100%;
	box-sizing: border-box;
	overflow: auto;
	overflow-x: clip;
	overscroll-behavior: contain;
	background: var(--MI-surface-nav);
	border-right: solid 1px var(--MI-border-muted);
	contain: strict;

	/* 画面が縦に長い、設置している項目数が少ないなどの環境においても確実にbottomを最下部に表示するため */
	display: flex;
	flex-direction: column;

	direction: rtl; /* スクロールバーを左に表示したいため */
}

.top {
	flex-shrink: 0;
	direction: ltr;
	background: var(--MI-surface-nav);
}

.middle {
	flex: 1;
	direction: ltr;
}

.bottom {
	flex-shrink: 0;
	direction: ltr;
	background: var(--MI-surface-nav);
}

.root:not(.iconOnly) {
	.body {
		width: var(--nav-width);
	}

	.top {
		--top-height: 68px;

		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		height: var(--top-height);
		padding-top: env(safe-area-inset-top, 0px);
		padding-inline: var(--MI-space-sm);
		border-bottom: solid 1px var(--MI-border-muted);
	}

	.instance {
		position: relative;
		width: 52px;
	}

	.middle {
		padding-top: var(--MI-space-xs);
	}

	.instanceIcon {
		display: inline-block;
		width: 36px;
		aspect-ratio: 1;
		border-radius: var(--MI-radius-sm);
		box-shadow: var(--MI-shadow-sm);
	}

	.topAction {
		display: inline-block;
		width: 40px;
		color: var(--MI_THEME-navFg);

		&:hover {
			color: var(--MI_THEME-fgHighlighted);
		}

		&:focus-visible {
			outline-offset: -2px;
		}
	}

	.realtimeMode {
		margin-left: auto;

		&.on {
			color: var(--MI_THEME-accent);
		}
	}

	.bottom {
		position: sticky;
		bottom: 0;
		padding: var(--MI-space-sm) 0 max(var(--MI-space-xs), env(safe-area-inset-bottom, 0px));
		border-top: solid 1px var(--MI-border-muted);
	}

	.post {
		display: flex;
		align-items: center;
		width: calc(100% - (var(--MI-space-md) * 2));
		height: var(--MI-control-md);
		margin: 0 var(--MI-space-md) var(--MI-space-xs);
		padding: 0 var(--MI-space-lg);
		color: var(--MI_THEME-fgOnAccent);
		font-weight: 650;
		text-align: left;
		background: var(--MI_THEME-accent);
		border-radius: var(--MI-radius-md);

		&:hover, &.active {
			background: hsl(from var(--MI_THEME-accent) h s calc(l + 7));
		}

		&:focus-visible {
			outline: 2px solid var(--MI_THEME-fgOnAccent);
			outline-offset: -4px;
		}
	}

	.postIcon {
		margin-right: var(--MI-space-sm);
		width: 24px;
	}

	.postText {
		position: relative;
	}

	.account {
		position: relative;
		display: flex;
		align-items: center;
		padding: var(--MI-space-sm) var(--MI-space-lg);
		border-radius: var(--MI-radius-md);
		width: 100%;
		text-align: left;
		box-sizing: border-box;
		overflow: clip;

		&:focus-visible {
			outline: none;

			> .avatar {
				box-shadow: 0 0 0 4px var(--MI_THEME-focus);
			}
		}
	}

	.avatar {
		display: block;
		flex-shrink: 0;
		position: relative;
		width: 32px;
		aspect-ratio: 1;
		margin-right: 8px;
	}

	.acct {
		display: block;
		flex-shrink: 1;
		padding-right: 8px;
	}

	.divider {
		margin: var(--MI-space-sm) var(--MI-space-xl);
		border-top: solid 1px var(--MI-border-muted);
	}

	.item {
		position: relative;
		display: block;
		margin: 2px var(--MI-space-sm);
		padding: 0 var(--MI-space-md);
		line-height: 40px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		width: calc(100% - (var(--MI-space-sm) * 2));
		text-align: left;
		box-sizing: border-box;
		color: var(--MI_THEME-navFg);
		border-radius: var(--MI-radius-sm);

		&:hover {
			text-decoration: none;
			color: var(--MI_THEME-fgHighlighted);
		}

		&:focus-visible {
			color: var(--MI_THEME-accent);
			background: var(--MI_THEME-accentedBg);
			outline-offset: -2px;
		}

		&.active {
			color: var(--MI_THEME-navActive);
			background: color-mix(in oklab, var(--MI_THEME-navActive) 15%, transparent);
		}
	}

	.itemIcon {
		width: 28px;
		margin-right: 8px;
	}

	.itemIndicator {
		position: absolute;
		top: 0;
		left: 20px;
		color: var(--MI_THEME-navIndicator);
		font-size: 8px;

		&:has(.itemIndicateValueIcon) {
			animation: none;
			left: auto;
			right: 40px;
			font-size: 10px;
		}
	}

	.itemText {
		font-size: 0.95em;
		font-weight: 550;
	}
}

.root.iconOnly {
	flex: 0 0 var(--nav-icon-only-width);
	width: var(--nav-icon-only-width);

	.body {
		width: var(--nav-icon-only-width);
	}

	.top {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: var(--MI-space-lg) 0 var(--MI-space-md);
		border-bottom: solid 1px var(--MI-border-muted);
	}

	.instance {
		display: block;
		text-align: center;
		width: 100%;

		&:focus-visible {
			outline: none;

			> .instanceIcon {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: 2px;
			}
		}
	}

	.instanceIcon {
		display: inline-block;
		width: 36px;
		aspect-ratio: 1;
		border-radius: var(--MI-radius-sm);
	}

	.bottom {
		position: sticky;
		bottom: 0;
		padding: var(--MI-space-sm) 0;
		border-top: solid 1px var(--MI-border-muted);
	}

	.widget {
		display: block;
		position: relative;
		width: 100%;
		height: var(--MI-control-lg);
		text-align: center;
	}

	.realtimeMode {
		display: block;
		position: relative;
		width: 100%;
		height: var(--MI-control-lg);
		text-align: center;

		&.on {
			color: var(--MI_THEME-accent);
		}
	}

	.post {
		display: block;
		position: relative;
		width: 100%;
		height: 56px;
		text-align: center;

		&::before {
			content: "";
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			margin: auto;
			width: 48px;
			aspect-ratio: 1/1;
			border-radius: var(--MI-radius-md);
			background: var(--MI_THEME-accent);
		}

		&:focus-visible {
			outline: none;

			&::before {
				outline: 2px solid var(--MI_THEME-fgOnAccent);
				outline-offset: -4px;
			}
		}

		&:hover, &.active {
			&::before {
				background: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
			}
		}
	}

	.postIcon {
		position: relative;
		color: var(--MI_THEME-fgOnAccent);
	}

	.postText {
		display: none;
	}

	.account {
		display: block;
		text-align: center;
		padding: var(--MI-space-md) 0;
		width: 100%;
		overflow: clip;

		&:focus-visible {
			outline: none;

			> .avatar {
				box-shadow: 0 0 0 4px var(--MI_THEME-focus);
			}
		}
	}

	.avatar {
		display: inline-block;
		width: 32px;
		aspect-ratio: 1;
	}

	.acct {
		display: none;
	}

	.divider {
		margin: 8px auto;
		width: calc(100% - 32px);
		border-top: solid 1px var(--MI-border-muted);
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		padding: 0;
		width: 48px;
		height: 44px;
		margin: 4px auto;
		text-align: center;
		border-radius: var(--MI-radius-sm);

		&:hover {
			text-decoration: none;
			color: var(--MI_THEME-fgHighlighted);
		}

		&:focus-visible {
			text-decoration: none;
			color: var(--MI_THEME-accent);
			background: var(--MI_THEME-accentedBg);
			outline-offset: -2px;
		}

		&.active {
			color: var(--MI_THEME-navActive);
			background: color-mix(in oklab, var(--MI_THEME-navActive) 15%, transparent);
		}
	}

	.itemIcon {
		display: inline-block;
		margin: 0;
	}

	.itemText {
		display: none;
	}

	.itemIndicator {
		position: absolute;
		top: 6px;
		left: 24px;
		color: var(--MI_THEME-navIndicator);
		font-size: 8px;

		&:has(.itemIndicateValueIcon) {
			animation: none;
			top: 4px;
			left: auto;
			right: 4px;
			font-size: 10px;
		}
	}

	.navExpand {
		display: block;
		position: relative;
		width: 100%;
		height: 32px;
		margin-top: var(--MI-space-xs);
		color: var(--MI_THEME-navFg);
		text-align: center;

		&:hover {
			color: var(--MI_THEME-fgHighlighted);
		}

		&:focus-visible {
			outline-offset: -2px;
		}
	}
}
</style>
