/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comment } from '@/server/web/views/_.js';
import type { CommonProps } from '@/server/web/views/_.js';
import { Splash } from '@/server/web/views/_splash.js';
import { BootConstantsScript, CommonHeadMeta, JsonDataScript, NoScriptNotice } from '@/server/web/views/_head.js';
import type { PropsWithChildren, Children } from '@kitajs/html';

export function BaseEmbed(
	props: PropsWithChildren<
		CommonProps<{
			title?: string;
			noindex?: boolean;
			desc?: string;
			img?: string;
			serverErrorImageUrl?: string | null;
			infoImageUrl?: string | null;
			notFoundImageUrl?: string | null;
			metaJson?: string;
			embedCtxJson?: string;

			titleSlot?: Children;
			metaSlot?: Children;
		}>
	>,
) {
	const now = Date.now();

	return (
		<>
			{'<!DOCTYPE html>'}
			{comment}
			<html lang="en">
				<head>
					<CommonHeadMeta
						themeColor={props.themeColor}
						instanceName={props.instanceName}
						instanceUrl={props.instanceUrl}
					/>
					<link rel="icon" href={props.icon ?? '/client-assets/toneriko-icon.svg'} />
					<link rel="apple-touch-icon" href={props.appleTouchIcon ?? '/client-assets/toneriko-icon.png'} />

					{props.frontendEmbedViteFiles == null ? <script type="module" src="/embed_vite/@vite/client"></script> : null}

					{(props.frontendEmbedViteFiles?.css ?? []).map((href) => (
						<link rel="stylesheet" href={`/embed_vite/${href}`} />
					))}

					{props.titleSlot ?? <title safe>{props.title || 'Toneriko'}</title>}

					{props.metaSlot}

					<meta name="robots" content="noindex" />

					{props.frontendEmbedBootloaderCss != null ? (
						<style safe>{props.frontendEmbedBootloaderCss}</style>
					) : (
						<link rel="stylesheet" href="/embed_vite/loader/style.css" />
					)}

					<BootConstantsScript version={props.version} viteFiles={props.frontendEmbedViteFiles} langs={props.langs} />

					<JsonDataScript id="misskey_meta" json={props.metaJson} generatedAt={now} />
					<JsonDataScript id="misskey_embedCtx" json={props.embedCtxJson} generatedAt={now} />

					{props.frontendEmbedBootloaderJs != null ? (
						<script>{props.frontendEmbedBootloaderJs}</script>
					) : (
						<script src="/embed_vite/loader/boot.js"></script>
					)}
				</head>
				<body>
					<NoScriptNotice />
					<Splash icon={props.icon} />
					{props.children}
				</body>
			</html>
		</>
	);
}
