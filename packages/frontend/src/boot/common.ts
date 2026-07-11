/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { watch, version as vueVersion } from 'vue';
import { compareVersions } from 'compare-versions';
import { version, lang, apiUrl, isSafeMode } from '@shared/utility/config.js';
import defaultLightTheme from '@shared/themes/l-light.json5';
import defaultDarkTheme from '@shared/themes/d-green-lime.json5';
import { parseThemeOrNull } from '@shared/utility/theme.js';
import { storeBootloaderErrors } from '@shared/utility/store-boot-errors';
import type { App } from 'vue';
import widgets from '@/widgets/index.js';
import directives from '@/directives/index.js';
import components from '@/components/index.js';
import { themeManager } from '@/theme.js';
import { isDeviceDarkmode } from '@/utility/is-device-darkmode.js';
import { i18n } from '@/i18n.js';
import { refreshCurrentAccount, login } from '@/accounts.js';
import { store } from '@/store.js';
import { fetchInstance, instance } from '@/instance.js';
import { updateDeviceKind } from '@/utility/device-kind.js';
import { reloadChannel } from '@/utility/unison-reload.js';
import { getUrlWithoutLoginId } from '@/utility/login-id.js';
import { getAccountFromId } from '@/features/users/get-account-from-id.js';
import { analytics, initAnalytics } from '@/analytics.js';
import { miLocalStorage } from '@/local-storage.js';
import { fetchCustomEmojis } from '@/features/custom-emojis/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { launchPlugins } from '@/plugin.js';

export async function common(app: App<Element>, prepareVue: () => Promise<void>) {
	console.info(`Misskey v${version}`);

	if (_DEV_) {
		console.warn('Development mode!!!');

		console.info(`vue ${vueVersion}`);

		window.addEventListener('error', (event) => {
			console.error(event);
		});

		window.addEventListener('unhandledrejection', (event) => {
			console.error(event);
		});
	}

	let isClientUpdated = false;

	//#region クライアントが更新されたかチェック
	const lastVersion = miLocalStorage.getItem('lastVersion');
	if (lastVersion !== version) {
		miLocalStorage.setItem('lastVersion', version);

		try {
			// 変なバージョン文字列来るとcompareVersionsでエラーになるため
			if (lastVersion != null && compareVersions(version, lastVersion) === 1) {
				isClientUpdated = true;
			}
		} catch (err) {
			/* empty */
		}
	}
	//#endregion

	//#region Detect language & fetch translations
	storeBootloaderErrors({ ...i18n.ts._bootErrors, reload: i18n.ts.reload });

	if (import.meta.hot) {
		import.meta.hot.on('locale-update', async (updatedLang: string) => {
			console.info(`Locale updated: ${updatedLang}`);
			if (updatedLang === lang) {
				await new Promise((resolve) => {
					window.setTimeout(resolve, 500);
				});
				// Replace the cached response before reloading. `no-store` would fetch the
				// latest locale but leave the stale response in the browser cache.
				await window
					.fetch(`/assets/locales/${lang}.${version}.json`, { cache: 'reload' })
					.then(async (res) => res.status === 200 && (await res.text()));
				window.location.reload();
			}
		});
	}
	//#endregion

	// タッチデバイスでCSSの:hoverを機能させる
	window.document.addEventListener('touchend', () => {}, { passive: true });

	// URLに#pswpを含む場合は取り除く
	if (window.location.hash === '#pswp') {
		window.history.replaceState(null, '', window.location.href.replace('#pswp', ''));
	}

	// 一斉リロード
	reloadChannel.addEventListener('message', (ev: MessageEvent<string | null>) => {
		if (ev.data !== null) window.location.href = ev.data;
		else window.location.reload();
	});

	//#region Set lang attr
	const html = window.document.documentElement;
	html.setAttribute('lang', lang);
	//#endregion

	await store.$persistReady;

	const fetchInstanceMetaPromise = fetchInstance();

	fetchInstanceMetaPromise.then(() => {
		miLocalStorage.setItem('v', instance.version);
	});

	//#region loginId
	const params = new URLSearchParams(window.location.search);
	const loginId = params.get('loginId');

	if (loginId) {
		const target = getUrlWithoutLoginId(window.location.href);

		if (!$i || $i.id !== loginId) {
			const account = await getAccountFromId(loginId);
			if (account) {
				await login(account.token, target);
			}
		}

		window.history.replaceState({ misskey: 'loginId' }, '', target);
	}
	//#endregion

	//#region Sync dark mode
	if (prefer.syncDeviceDarkMode) {
		store.set('darkMode', isDeviceDarkmode());
	}

	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (mql) => {
		if (prefer.syncDeviceDarkMode) {
			store.set('darkMode', mql.matches);
		}
	});
	//#endregion

	if (!isSafeMode) {
		if (prefer.lightTheme == null) {
			const instanceLightTheme = parseThemeOrNull(instance.defaultLightTheme);
			if (instanceLightTheme != null) prefer.commit('lightTheme', instanceLightTheme);
		}
		if (prefer.darkTheme == null) {
			const instanceDarkTheme = parseThemeOrNull(instance.defaultDarkTheme);
			if (instanceDarkTheme != null) prefer.commit('darkTheme', instanceDarkTheme);
		}
	}

	// NOTE: この処理は必ずクライアント更新チェック処理より後に来ること(テーマ再構築のため)
	// NOTE: この処理は必ずダークモード判定処理より後に来ること(初回のテーマ適用のため)
	// NOTE: この処理は必ずサーバーテーマ適用処理より後に来ること(二重発火を防ぐため)
	// see: https://github.com/misskey-dev/misskey/issues/16562
	watch(
		() => store.darkMode,
		(darkMode) => {
			const theme = (() => {
				if (darkMode) {
					return isSafeMode ? defaultDarkTheme : (prefer.darkTheme ?? defaultDarkTheme);
				} else {
					return isSafeMode ? defaultLightTheme : (prefer.lightTheme ?? defaultLightTheme);
				}
			})();

			themeManager.updateTheme(theme);
		},
		{ immediate: true },
	);

	window.document.documentElement.dataset.colorScheme = store.darkMode ? 'dark' : 'light';

	if (!isSafeMode) {
		watch(
			() => prefer.darkTheme,
			(theme) => {
				if (store.darkMode) {
					themeManager.updateTheme(theme ?? defaultDarkTheme);
				}
			},
		);

		watch(
			() => prefer.lightTheme,
			(theme) => {
				if (!store.darkMode) {
					themeManager.updateTheme(theme ?? defaultLightTheme);
				}
			},
		);
	}

	watch(
		() => prefer.overridedDeviceKind,
		(kind) => {
			updateDeviceKind(kind);
		},
		{ immediate: true },
	);

	watch(
		() => prefer.useBlurEffectForModal,
		(v) => {
			window.document.documentElement.style.setProperty('--MI-modalBgFilter', v ? 'blur(4px)' : 'none');
		},
		{ immediate: true },
	);

	watch(
		() => prefer.useBlurEffect,
		(v) => {
			if (v) {
				window.document.documentElement.style.removeProperty('--MI-blur');
			} else {
				window.document.documentElement.style.setProperty('--MI-blur', 'none');
			}
		},
		{ immediate: true },
	);

	// Keep screen on. 再取得のたびにvisibilitychangeリスナーを増やさない。
	if (prefer.keepScreenOn && 'wakeLock' in navigator) {
		let wakeLock: WakeLockSentinel | null = null;
		let requestingWakeLock = false;
		let waitingForActivation = false;

		const requestWakeLock = async (): Promise<void> => {
			if (wakeLock != null || requestingWakeLock || window.document.visibilityState !== 'visible') return;
			requestingWakeLock = true;
			try {
				wakeLock = await navigator.wakeLock.request('screen');
				wakeLock.addEventListener('release', () => {
					wakeLock = null;
				}, { once: true });
			} catch {
				if (waitingForActivation) return;
				waitingForActivation = true;
				// WebKit系ではユーザー操作後でないと要求できない場合がある。
				window.document.addEventListener('click', () => {
					waitingForActivation = false;
					void requestWakeLock();
				}, { once: true });
			} finally {
				requestingWakeLock = false;
			}
		};

		window.document.addEventListener('visibilitychange', () => {
			if (window.document.visibilityState === 'visible') void requestWakeLock();
		});
		void requestWakeLock();
	}

	if (prefer.makeEveryTextElementsSelectable) {
		window.document.documentElement.classList.add('forceSelectableAll');
	}

	//#region Fetch user
	if ($i && $i.token) {
		if (_DEV_) {
			console.log('account cache found. refreshing...');
		}

		refreshCurrentAccount();
	}
	//#endregion

	try {
		await fetchCustomEmojis();
	} catch (err) {
		/* empty */
	}

	// analytics
	fetchInstanceMetaPromise.then(async () => {
		await initAnalytics(instance);

		if ($i) {
			analytics.identify($i.id);
		}

		analytics.page({
			path: window.location.pathname,
		});
	});

	await prepareVue();

	if (_DEV_) {
		app.config.performance = true;
	}

	widgets(app);
	directives(app);
	components(app);

	// https://github.com/misskey-dev/misskey/pull/8575#issuecomment-1114239210
	// なぜか2回実行されることがあるため、mountするdivを1つに制限する
	const rootEl = ((): HTMLElement => {
		const MISSKEY_MOUNT_DIV_ID = 'misskey_app';

		const currentRoot = window.document.getElementById(MISSKEY_MOUNT_DIV_ID);

		if (currentRoot) {
			console.warn('multiple import detected');
			return currentRoot;
		}

		const root = window.document.createElement('div');
		root.id = MISSKEY_MOUNT_DIV_ID;
		window.document.body.appendChild(root);
		return root;
	})();

	if (instance.sentryForFrontend) {
		const Sentry = await import('@sentry/vue');
		Sentry.init({
			app,
			integrations: [
				...(instance.sentryForFrontend.vueIntegration !== undefined
					? [Sentry.vueIntegration(instance.sentryForFrontend.vueIntegration ?? undefined)]
					: []),
				...(instance.sentryForFrontend.browserTracingIntegration !== undefined
					? [Sentry.browserTracingIntegration(instance.sentryForFrontend.browserTracingIntegration ?? undefined)]
					: []),
				...(instance.sentryForFrontend.replayIntegration !== undefined
					? [Sentry.replayIntegration(instance.sentryForFrontend.replayIntegration ?? undefined)]
					: []),
			],

			// Set tracesSampleRate to 1.0 to capture 100%
			tracesSampleRate: 1.0,

			// Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
			...(instance.sentryForFrontend.browserTracingIntegration !== undefined
				? {
						tracePropagationTargets: [apiUrl],
					}
				: {}),

			// Capture Replay for 10% of all sessions,
			// plus for 100% of sessions with an error
			...(instance.sentryForFrontend.replayIntegration !== undefined
				? {
						replaysSessionSampleRate: 0.1,
						replaysOnErrorSampleRate: 1.0,
					}
				: {}),

			...instance.sentryForFrontend.options,
		});
	}

	try {
		await launchPlugins();
	} catch (error) {
		console.error('Failed to launch plugins:', error);
	}

	app.mount(rootEl);

	// boot.jsのやつを解除
	window.onerror = null;
	window.onunhandledrejection = null;

	removeSplash();

	//#region Self-XSS 対策メッセージ
	if (!_DEV_) {
		console.log(
			`%c${i18n.ts._selfXssPrevention.warning}`,
			'color: #f00; background-color: #ff0; font-size: 36px; padding: 4px;',
		);
		console.log(
			`%c${i18n.ts._selfXssPrevention.title}`,
			'color: #f00; font-weight: 900; font-family: "Hiragino Sans W9", "Hiragino Kaku Gothic ProN", sans-serif; font-size: 24px;',
		);
		console.log(`%c${i18n.ts._selfXssPrevention.description1}`, 'font-size: 16px; font-weight: 700;');
		console.log(
			`%c${i18n.ts._selfXssPrevention.description2}`,
			'font-size: 16px;',
			'font-size: 20px; font-weight: 700; color: #f00;',
		);
		console.log(
			i18n.tsx._selfXssPrevention.description3({ link: 'https://misskey-hub.net/docs/for-users/resources/self-xss/' }),
		);
	}
	//#endregion

	return {
		isClientUpdated,
		lastVersion,
		app,
	};
}

function removeSplash() {
	const splash = window.document.getElementById('splash');
	if (splash) {
		splash.style.opacity = '0';
		splash.style.pointerEvents = 'none';

		// transitionendイベントが発火しない場合があるため
		window.setTimeout(() => {
			splash.remove();
		}, 1000);
	}
}
