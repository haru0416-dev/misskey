/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CommonData, ViteFiles } from '@/server/web/views/_.js';

// 通常画面と埋め込み画面で同一の head 要素。アイコンの既定値の扱い (|| と ??) は両者で異なるため含めない。
export function CommonHeadMeta(props: Pick<CommonData, 'themeColor' | 'instanceName' | 'instanceUrl'>) {
	return (
		<>
			<meta charset="UTF-8" />
			<meta name="application-name" content="Toneriko" />
			<meta name="referer" content="origin" />
			<meta name="theme-color" content={props.themeColor ?? '#5c62d8'} />
			<meta name="theme-color-orig" content={props.themeColor ?? '#5c62d8'} />
			<meta property="og:site_name" content={props.instanceName || 'Toneriko'} />
			<meta property="instance_url" content={props.instanceUrl} />
			<meta
				name="viewport"
				content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
			/>
			<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
		</>
	);
}

// ブートローダーが読む定数。変数名はフロントエンドのローダーと一致させる必要がある。
export function BootConstantsScript(props: { version: string; viteFiles: ViteFiles | null; langs: string[] }) {
	return (
		<script>
			const VERSION = '{props.version}'; const CLIENT_ENTRY = {JSON.stringify(props.viteFiles?.entryJs ?? null)}; const
			CLIENT_PRELOADS = {JSON.stringify(props.viteFiles?.modulePreloads ?? [])}; const LANGS ={' '}
			{JSON.stringify(props.langs)};
		</script>
	);
}

export function JsonDataScript(props: { id: string; json: string | undefined; generatedAt: number }) {
	// 変数名をsafeで始めることでエラーをスキップ
	const safeJson = props.json;
	return safeJson != null ? (
		<script type="application/json" id={props.id} data-generated-at={props.generatedAt}>
			{safeJson}
		</script>
	) : null;
}

export function NoScriptNotice() {
	return (
		<noscript>
			<p>
				JavaScriptを有効にしてください
				<br />
				Please turn on your JavaScript
			</p>
		</noscript>
	);
}
