/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 本体のブートローダー。アプリの読み込みを始め、利用者の表示設定 (テーマ・文字の大きさ・カスタム CSS) を
// アプリより先に当てて、読み込み中のちらつきを防ぐ。

import {
	addStyle,
	detectLang,
	escapeHtml,
	installErrorHandlers,
	readBootErrorMessages,
	startApp,
	whenBodyReady,
} from './common.js';

const renderError = async (code: string, details?: unknown): Promise<void> => {
	await whenBodyReady();

	const messages = {
		title: 'Failed to initialize Toneriko',
		solution: 'The following actions may solve the problem.',
		solution1: 'Update your os and browser',
		solution2: 'Disable an adblocker',
		solution3: 'Clear the browser cache',
		solution4: '(Tor Browser) Set dom.webaudio.enabled to true',
		otherOption: 'Other options',
		otherOption1: 'Clear preferences and cache',
		otherOption2: 'Start the simple client',
		otherOption3: 'Start the repair tool',
		otherOption4: 'Start Toneriko in safe mode',
		reload: 'Reload',
		...readBootErrorMessages(),
	};
	const t = (key: keyof typeof messages) => escapeHtml(messages[key] ?? '');

	const safeModeUrl = new URL(window.location.href);
	safeModeUrl.searchParams.set('safemode', 'true');

	let errorsElement = document.getElementById('errors');
	if (errorsElement == null) {
		document.body.innerHTML = `
			<svg class="icon-warning" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
				<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
				<path d="M12 9v2m0 4v.01"></path>
				<path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75"></path>
			</svg>
			<h1>${t('title')}</h1>
			<button class="button-big" onclick="location.reload(true);">
				<span class="button-label-big">${t('reload')}</span>
			</button>
			<p><b>${t('solution')}</b></p>
			<p>${t('solution1')}</p>
			<p>${t('solution2')}</p>
			<p>${t('solution3')}</p>
			<p>${t('solution4')}</p>
			<details style="color: #8185f2;">
				<summary>${t('otherOption')}</summary>
				<a href="${escapeHtml(safeModeUrl.href)}">
					<button class="button-small">
						<span class="button-label-small">${t('otherOption4')}</span>
					</button>
				</a>
				<br>
				<a href="/flush">
					<button class="button-small">
						<span class="button-label-small">${t('otherOption1')}</span>
					</button>
				</a>
				<br>
				<a href="/cli">
					<button class="button-small">
						<span class="button-label-small">${t('otherOption2')}</span>
					</button>
				</a>
				<br>
				<a href="/bios">
					<button class="button-small">
						<span class="button-label-small">${t('otherOption3')}</span>
					</button>
				</a>
			</details>
			<br>
			<div id="errors"></div>
		`;
		errorsElement = document.getElementById('errors')!;
	}

	// 複数のエラーが続けて起きたときは、詳細を 1 つずつ足していく。
	const detailsElement = document.createElement('details');
	detailsElement.id = 'errorInfo';
	const summary = document.createElement('summary');
	const codeElement = document.createElement('code');
	codeElement.textContent = `ERROR CODE: ${code}`;
	summary.appendChild(codeElement);
	const detailText = document.createElement('code');
	detailText.textContent = `${String(details)} ${JSON.stringify(details)}`;
	detailsElement.append(document.createElement('br'), summary, detailText);
	errorsElement.appendChild(detailsElement);

	// 色は Toneriko のダークテーマ (src/shared/themes/d-toneriko.json5) に合わせる。
	addStyle(`
		* {
			font-family: BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
		}

		#misskey_app,
		#splash {
			display: none !important;
		}

		body,
		html {
			background-color: #191a21;
			color: #c9ccda;
			justify-content: center;
			margin: auto;
			padding: 10px;
			text-align: center;
		}

		button {
			border-radius: 999px;
			padding: 0px 12px 0px 12px;
			border: none;
			cursor: pointer;
			margin-bottom: 12px;
		}

		.button-big {
			background: linear-gradient(90deg, #8185f2, #5c62d8);
			line-height: 50px;
		}

		.button-big:hover {
			background: #9a9ef5;
		}

		.button-small {
			background: #2e303b;
			line-height: 40px;
		}

		.button-small:hover {
			background: #383a47;
		}

		.button-label-big {
			color: #fff;
			font-weight: bold;
			font-size: 1.2em;
			padding: 12px;
		}

		.button-label-small {
			color: #a9adf5;
			font-size: 16px;
			padding: 12px;
		}

		a {
			color: #8185f2;
			text-decoration: none;
		}

		p,
		li {
			font-size: 16px;
		}

		.icon-warning {
			color: #dec340;
			height: 4rem;
			padding-top: 2rem;
		}

		h1 {
			font-size: 1.5em;
			margin: 1em;
		}

		code {
			font-family: Fira, FiraCode, monospace;
		}

		#errorInfo {
			background: #333;
			margin-bottom: 2rem;
			padding: 0.5rem 1rem;
			width: 40rem;
			border-radius: 10px;
			justify-content: center;
			margin: auto;
		}

		#errorInfo summary {
			cursor: pointer;
		}

		#errorInfo summary > * {
			display: inline;
		}

		@media screen and (max-width: 500px) {
			#errorInfo {
				width: 50%;
			}
		}`);
};

function applyDisplayPreferences(): void {
	let isSafeMode = localStorage.getItem('isSafeMode') === 'true';
	if (!isSafeMode && new URLSearchParams(window.location.search).get('safemode') === 'true') {
		localStorage.setItem('isSafeMode', 'true');
		isSafeMode = true;
	}

	// セーフモードでは、利用者が入れたテーマとカスタム CSS を当てない (それが原因で起動できない場合の逃げ道)。
	if (!isSafeMode) {
		const theme = localStorage.getItem('theme');
		if (theme) {
			for (const [k, v] of Object.entries(JSON.parse(theme) as Record<string, unknown>)) {
				document.documentElement.style.setProperty(`--MI_THEME-${k}`, String(v));
				if (k === 'htmlThemeColor') {
					document.head.querySelector('meta[name="theme-color"]')?.setAttribute('content', String(v));
				}
			}
		}
	}

	const colorScheme = localStorage.getItem('colorScheme');
	if (colorScheme) {
		document.documentElement.style.setProperty('color-scheme', colorScheme);
	}

	const fontSize = localStorage.getItem('fontSize');
	if (fontSize) {
		document.documentElement.classList.add('f-' + fontSize);
	}

	if (localStorage.getItem('useSystemFont')) {
		document.documentElement.classList.add('useSystemFont');
	}

	if (!isSafeMode) {
		const customCss = localStorage.getItem('customCss');
		if (customCss) {
			const style = document.createElement('style');
			style.innerHTML = customCss;
			document.head.appendChild(style);
		}
	}
}

if (installErrorHandlers(renderError)) {
	const lang = detectLang();
	localStorage.setItem('lang', lang);
	startApp({ base: '/vite/', devEntry: '/vite/src/boot/entry.ts', lang, renderError });
	applyDisplayPreferences();
}
