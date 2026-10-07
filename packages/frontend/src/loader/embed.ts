/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 外部サイトに埋め込む画面 (/embed/*) のブートローダー。利用者の表示設定は持たず、
// 埋め込む側が URL で指定する角丸と枠線だけを当てる。

import {
	addStyle,
	detectLang,
	escapeHtml,
	installErrorHandlers,
	readBootErrorMessages,
	startApp,
	whenBodyReady,
} from './common.js';

let errorStyleInstalled = false;

const renderError = async (code: string): Promise<void> => {
	await whenBodyReady();

	const messages = readBootErrorMessages();
	const title = escapeHtml(messages.title || 'Failed to initialize Toneriko');
	const reload = escapeHtml(messages.reload || 'Reload');

	document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 9v4" /><path d="M12 16v.01" /></svg>
		<div class="message">${title}</div>
		<div class="submessage">Error Code: ${escapeHtml(code)}</div>
		<button onclick="location.reload(!0)">
			<div>${reload}</div>
		</button>`;

	if (errorStyleInstalled) {
		return;
	}

	// 色は Toneriko のダークテーマ (src/shared/themes/d-toneriko.json5) に合わせる。
	addStyle(`
		#misskey_app,
		#splash {
			display: none !important;
		}

		html,
		body {
			margin: 0;
		}

		body {
			position: relative;
			color: #c9ccda;
			font-family: Hiragino Maru Gothic Pro, BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
			line-height: 1.35;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
			margin: 0;
			padding: 24px;
			box-sizing: border-box;
			overflow: hidden;

			border-radius: var(--radius, 12px);
			border: 1px solid #9aa0c429;
		}

		body::before {
			content: '';
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: #191a21;
			border-radius: var(--radius, 12px);
			z-index: -1;
		}

		html.embed.norounded body,
		html.embed.norounded body::before {
			border-radius: 0;
		}

		html.embed.noborder body {
			border: none;
		}

		.icon {
			max-width: 60px;
			width: 100%;
			height: auto;
			margin-bottom: 20px;
			color: #dec340;
		}

		.message {
			text-align: center;
			font-size: 20px;
			font-weight: 700;
			margin-bottom: 20px;
		}

		.submessage {
			text-align: center;
			font-size: 90%;
			margin-bottom: 7.5px;
		}

		.submessage:last-of-type {
			margin-bottom: 20px;
		}

		button {
			padding: 7px 14px;
			min-width: 100px;
			font-weight: 700;
			font-family: Hiragino Maru Gothic Pro, BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
			line-height: 1.35;
			border-radius: 99rem;
			background-color: #8185f2;
			color: #fff;
			border: none;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
		}

		button:hover {
			background-color: #9a9ef5;
		}`);
	errorStyleInstalled = true;
};

if (installErrorHandlers(renderError)) {
	const params = new URLSearchParams(location.search);
	if (params.get('rounded') === 'false') {
		document.documentElement.classList.add('norounded');
	}
	if (params.get('border') === 'false') {
		document.documentElement.classList.add('noborder');
	}

	const lang = detectLang();
	startApp({ base: '/embed_vite/', devEntry: '/embed_vite/src/embed/boot.ts', lang, renderError });
	localStorage.setItem('lang', lang);
}
