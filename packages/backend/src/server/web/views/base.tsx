/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comment, defaultDescription } from '@/server/web/views/_.js';
import { Splash } from '@/server/web/views/_splash.js';
import { BootConstantsScript, CommonHeadMeta, JsonDataScript, NoScriptNotice } from '@/server/web/views/_head.js';
import type { CommonProps } from '@/server/web/views/_.js';
import type { PropsWithChildren, Children } from '@kitajs/html';

export function Layout(
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
			clientCtxJson?: string;

			titleSlot?: Children;
			descSlot?: Children;
			metaSlot?: Children;
			ogSlot?: Children;
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
					<link rel="icon" href={props.icon || '/client-assets/toneriko-icon.svg'} />
					<link rel="apple-touch-icon" href={props.appleTouchIcon || '/client-assets/toneriko-icon.png'} />
					<link rel="manifest" href="/manifest.json" />
					<link
						rel="search"
						type="application/opensearchdescription+xml"
						title={props.title || 'Toneriko'}
						href={`${props.config.instance.url}/opensearch.xml`}
					/>
					{props.serverErrorImageUrl != null ? (
						<link rel="prefetch" as="image" href={props.serverErrorImageUrl} />
					) : null}
					{props.infoImageUrl != null ? <link rel="prefetch" as="image" href={props.infoImageUrl} /> : null}
					{props.notFoundImageUrl != null ? <link rel="prefetch" as="image" href={props.notFoundImageUrl} /> : null}

					{props.frontendViteFiles == null ? <script type="module" src="/vite/@vite/client"></script> : null}

					{(props.frontendViteFiles?.css ?? []).map((href) => (
						<link rel="stylesheet" href={`/vite/${href}`} />
					))}

					{props.titleSlot ?? <title safe>{props.title || 'Toneriko'}</title>}

					{props.noindex ? <meta name="robots" content="noindex" /> : null}

					{props.descSlot ??
						(props.desc != null ? <meta name="description" content={props.desc || defaultDescription} /> : null)}

					{props.metaSlot}

					{props.ogSlot ?? (
						<>
							<meta property="og:title" content={props.title || 'Toneriko'} />
							<meta property="og:description" content={props.desc || defaultDescription} />
							{props.img != null ? <meta property="og:image" content={props.img} /> : null}
							<meta property="twitter:card" content="summary" />
						</>
					)}

					{props.frontendBootloaderCss != null ? (
						<style safe>{props.frontendBootloaderCss}</style>
					) : (
						<link rel="stylesheet" href="/vite/loader/style.css" />
					)}

					<BootConstantsScript version={props.version} viteFiles={props.frontendViteFiles} langs={props.langs} />

					<JsonDataScript id="misskey_meta" json={props.metaJson} generatedAt={now} />
					<JsonDataScript id="misskey_clientCtx" json={props.clientCtxJson} generatedAt={now} />

					{props.frontendBootloaderJs != null ? (
						<script>{props.frontendBootloaderJs}</script>
					) : (
						<script src="/vite/loader/boot.js"></script>
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

export { Layout as BasePage };
