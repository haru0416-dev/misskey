/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, markRaw } from 'vue';
import { ui } from '@shared/utility/config.js';
import * as Misskey from 'misskey-js';
import { common } from './common.js';
import type { App, Component } from 'vue';
import type { Keymap } from '@/utility/hotkey.js';
import { i18n } from '@/i18n.js';
import { alert, confirm, popup, post } from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/features/sound/sound.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { store } from '@/store.js';
import { reactionPicker } from '@/features/emoji-picker/reaction-picker.js';
import { miLocalStorage } from '@/local-storage.js';
import { initializeSw } from '@/boot/initialize-sw.js';
import { emojiPicker } from '@/features/emoji-picker/emoji-picker.js';
import { mainRouter } from '@/router.js';
import { makeHotkey } from '@/utility/hotkey.js';
import { addCustomEmoji, removeCustomEmojis, updateCustomEmojis } from '@/features/custom-emojis/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { unisonReload } from '@/utility/unison-reload.js';

const MkUpdated = defineAsyncComponent(() => import('@/components/display/MkUpdated.vue'));
const MkUserSetupDialog = defineAsyncComponent(() => import('@/features/onboarding/components/MkUserSetupDialog.vue'));
const MkAnnouncementDialog = defineAsyncComponent(() => import('@/features/announcements/components/MkAnnouncementDialog.vue'));
const MkDonation = defineAsyncComponent(() => import('@/features/support/components/MkDonation.vue'));
const MkSourceCodeAvailablePopup = defineAsyncComponent(() => import('@/features/support/components/MkSourceCodeAvailablePopup.vue'));

export async function mainBoot(app: App<Element>, setRootComponent: (component: Component) => void) {
	const { isClientUpdated } = await common(app, async () => {
		let uiStyle = ui;
		const searchParams = new URLSearchParams(window.location.search);

		if (!$i) uiStyle = 'visitor';

		if (searchParams.has('zen')) uiStyle = 'zen';
		if (uiStyle === 'deck' && prefer['deck.useSimpleUiForNonRootPages'] && window.location.pathname !== '/')
			uiStyle = 'zen';

		if (searchParams.has('ui')) uiStyle = searchParams.get('ui');

		let rootComponent: Component;
		switch (uiStyle) {
			case 'zen':
				rootComponent = await import('@/ui/zen.vue').then((x) => x.default);
				break;
			case 'deck':
				rootComponent = await import('@/ui/deck.vue').then((x) => x.default);
				break;
			case 'visitor':
				rootComponent = await import('@/ui/visitor.vue').then((x) => x.default);
				break;
			default:
				rootComponent = await import('@/ui/universal.vue').then((x) => x.default);
				break;
		}

		setRootComponent(rootComponent);
	});

	reactionPicker.init();
	emojiPicker.init();

	if (isClientUpdated && $i) {
		const { dispose } = popup(
			MkUpdated,
			{},
			{
				closed: () => dispose(),
			},
		);
	}

	try {
		if (prefer.enableSeasonalScreenEffect) {
			const month = new Date().getMonth() + 1;
			if (prefer.hemisphere === 'S') {
				// ▼南半球
				if (month === 7 || month === 8) {
					const SnowfallEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SnowfallEffect({}).render();
				}
			} else {
				// ▼北半球
				if (month === 12 || month === 1) {
					const SnowfallEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SnowfallEffect({}).render();
				} else if (month === 3 || month === 4) {
					const SakuraEffect = (await import('@/utility/snowfall-effect.js')).SnowfallEffect;
					new SakuraEffect({
						sakura: true,
					}).render();
				}
			}
		}
	} catch (error) {
		// console.error(error);
		console.error('Failed to initialise the seasonal screen effect canvas context:', error);
	}

	if ($i) {
		store.$persistLoaded.then(async () => {
			if (store.accountSetupWizard !== -1) {
				const { dispose } = popup(
					MkUserSetupDialog,
					{},
					{
						closed: () => dispose(),
					},
				);
			}
		});

		for (const announcement of ($i.unreadAnnouncements ?? []).filter((x) => x.display === 'dialog')) {
			const { dispose } = popup(
				MkAnnouncementDialog,
				{
					announcement,
				},
				{
					closed: () => dispose(),
				},
			);
		}

		function onAnnouncementCreated(ev: { announcement: Misskey.entities.Announcement }) {
			const announcement = ev.announcement;
			if (announcement.display === 'dialog') {
				const { dispose } = popup(
					MkAnnouncementDialog,
					{
						announcement,
					},
					{
						closed: () => dispose(),
					},
				);
			}
		}

		if ($i.isDeleted) {
			alert({
				type: 'warning',
				text: i18n.ts.accountDeletionInProgress,
			});
		}

		const createdAt = new Date($i.createdAt);
		void import('@/features/achievements/initialize-achievements.js').then(({ initializeAchievements }) => initializeAchievements());

		const latestDonationInfoShownAt = miLocalStorage.getItem('latestDonationInfoShownAt');
		const neverShowDonationInfo = miLocalStorage.getItem('neverShowDonationInfo');
		if (
			neverShowDonationInfo !== 'true' &&
			createdAt.getTime() < Date.now() - 1000 * 60 * 60 * 24 * 3 &&
			!window.location.pathname.startsWith('/miauth')
		) {
			if (
				latestDonationInfoShownAt == null ||
				new Date(latestDonationInfoShownAt).getTime() < Date.now() - 1000 * 60 * 60 * 24 * 30
			) {
				const { dispose } = popup(
					MkDonation,
					{},
					{
						closed: () => dispose(),
					},
				);
			}
		}

		const modifiedVersionMustProminentlyOfferInAgplV3Section13Read = miLocalStorage.getItem(
			'modifiedVersionMustProminentlyOfferInAgplV3Section13Read',
		);
		if (
			modifiedVersionMustProminentlyOfferInAgplV3Section13Read !== 'true' &&
			instance.repositoryUrl !== 'https://github.com/misskey-dev/misskey'
		) {
			const { dispose } = popup(
				MkSourceCodeAvailablePopup,
				{},
				{
					closed: () => dispose(),
				},
			);
		}

		if (store.realtimeMode) {
			const stream = useStream();

			let reloadDialogShowing = false;
			stream.on('_disconnected_', async () => {
				if (prefer.serverDisconnectedBehavior === 'reload') {
					window.location.reload();
				} else if (prefer.serverDisconnectedBehavior === 'dialog') {
					if (reloadDialogShowing) return;
					reloadDialogShowing = true;
					const { canceled } = await confirm({
						type: 'warning',
						title: i18n.ts.disconnectedFromServer,
						text: i18n.ts.reloadConfirm,
					});
					reloadDialogShowing = false;
					if (!canceled) {
						window.location.reload();
					}
				}
			});

			stream.on('emojiAdded', (emojiData) => {
				addCustomEmoji(emojiData.emoji);
			});

			stream.on('emojiUpdated', (emojiData) => {
				updateCustomEmojis(emojiData.emojis);
			});

			stream.on('emojiDeleted', (emojiData) => {
				removeCustomEmojis(emojiData.emojis);
			});

			stream.on('announcementCreated', onAnnouncementCreated);

			const main = markRaw(stream.useChannel('main', null, 'System'));

			// 自分の情報が更新されたとき
			main.on('meUpdated', (i) => {
				updateCurrentAccountPartial(i);
			});

			main.on('readAllNotifications', () => {
				updateCurrentAccountPartial({
					hasUnreadNotification: false,
					unreadNotificationsCount: 0,
				});
			});

			main.on('unreadNotification', () => {
				const unreadNotificationsCount = ($i?.unreadNotificationsCount ?? 0) + 1;
				updateCurrentAccountPartial({
					hasUnreadNotification: true,
					unreadNotificationsCount,
				});
			});

			main.on('newChatMessage', () => {
				updateCurrentAccountPartial({ hasUnreadChatMessages: true });
				sound.playMisskeySfx('chatMessage');
			});

			main.on('readAllAnnouncements', () => {
				updateCurrentAccountPartial({ hasUnreadAnnouncement: false });
			});

			// 個人宛てお知らせが発行されたとき
			main.on('announcementCreated', onAnnouncementCreated);
		}
	}

	// shortcut
	let safemodeRequestCount = 0;
	let safemodeRequestTimer: number | null = null;
	const keymap = {
		'p|n': () => {
			if ($i == null) return;
			post();
		},
		d: async () => {
			const value = !store.darkMode;
			if (prefer.syncDeviceDarkMode) {
				const { canceled } = await confirm({
					type: 'question',
					text: i18n.tsx.switchDarkModeManuallyWhenSyncEnabledConfirm({ x: i18n.ts.syncDeviceDarkMode }),
				});
				if (canceled) return;

				prefer.commit('syncDeviceDarkMode', false);
				store.set('darkMode', value);
			} else {
				store.set('darkMode', value);
			}
		},
		s: () => {
			mainRouter.push('/search');
		},
		g: {
			callback: () => {
				// mを5回押すとセーフモードに入る
				safemodeRequestCount++;
				if (safemodeRequestCount >= 5) {
					miLocalStorage.setItem('isSafeMode', 'true');
					unisonReload();
				} else {
					if (safemodeRequestTimer != null) {
						window.clearTimeout(safemodeRequestTimer);
					}
					safemodeRequestTimer = window.setTimeout(() => {
						safemodeRequestCount = 0;
					}, 300);
				}
			},
			allowRepeat: true,
		},
	} as const satisfies Keymap;
	window.document.addEventListener('keydown', makeHotkey(keymap), { passive: false });

	initializeSw();
}
