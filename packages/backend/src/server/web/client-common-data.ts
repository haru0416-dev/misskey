/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fsp } from 'node:fs';
import { resolve } from 'node:path';
import { languages } from 'i18n/const';
import type { Manifest } from 'vite';
import type { Config } from '@/config.js';
import { packMetaDetailed } from '@/core/meta/MetaEntityPacker.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { htmlSafeJsonStringify } from '@/misc/json-stringify-html-safe.js';
import type { MiMeta } from '@/models/Meta.js';
import type { CommonData, ViteFiles } from './views/_.js';

export type ClientCommonDataDependencies = {
	config: Config;
	meta: MiMeta;
	db: MiDrizzleDatabase;
};

type ClientAssetState = {
	frontendAssetsFetched: boolean;
	frontendViteFiles: ViteFiles | null;
	frontendBootloaderJs: string | null;
	frontendBootloaderCss: string | null;
	frontendEmbedViteFiles: ViteFiles | null;
	frontendEmbedBootloaderJs: string | null;
	frontendEmbedBootloaderCss: string | null;
};

function initialAssetState(): ClientAssetState {
	return {
		frontendAssetsFetched: false,
		frontendViteFiles: null,
		frontendBootloaderJs: null,
		frontendBootloaderCss: null,
		frontendEmbedViteFiles: null,
		frontendEmbedBootloaderJs: null,
		frontendEmbedBootloaderCss: null,
	};
}

export function collectViteAssetFiles(manifest: Manifest): ViteFiles {
	const entryFile = Object.values(manifest).find((chunk) => chunk.isEntry);
	if (!entryFile) {
		return {
			entryJs: null,
			css: [],
			modulePreloads: [],
		};
	}

	const seenChunkIds = new Set<string>();
	const cssFiles = new Set<string>();
	const modulePreloads = new Set<string>();

	if (entryFile.css) {
		entryFile.css.forEach((css) => cssFiles.add(css));
	}

	if (entryFile.imports != null && Array.isArray(entryFile.imports)) {
		// 静的 import は奥まで全部先読みに入れる。modulepreload は指定したファイルしか取らず依存を辿らないので、
		// 直下だけだと依存が見つかるたびに往復 1 回ずつ待つ (往復 150 ms の回線で入口の後に 3 段、約 570 ms)。
		function collectImports(imports: string[]) {
			for (const importId of imports) {
				if (seenChunkIds.has(importId)) {
					continue;
				}
				seenChunkIds.add(importId);

				const importedChunk = manifest[importId];
				if (!importedChunk) {
					continue;
				}

				if (importedChunk.css) {
					importedChunk.css.forEach((css) => cssFiles.add(css));
				}

				if (importedChunk.imports != null && Array.isArray(importedChunk.imports)) {
					collectImports(importedChunk.imports);
				}

				modulePreloads.add(importedChunk.file);
			}
		}

		collectImports(entryFile.imports);
	}

	return {
		entryJs: entryFile.file,
		css: Array.from(cssFiles),
		modulePreloads: Array.from(modulePreloads),
	};
}

async function prepareFrontendAssets(deps: ClientCommonDataDependencies, state: ClientAssetState): Promise<void> {
	if (state.frontendAssetsFetched) {
		return;
	}
	state.frontendAssetsFetched = true;

	const frontendViteBuilt = resolve(deps.config.runtime.rootDir, 'built/_frontend_vite_');
	const frontendEmbedViteBuilt = resolve(deps.config.runtime.rootDir, 'built/_frontend_embed_vite_');
	const [bootJs, bootCss, embedBootJs, embedBootCss] = await Promise.all([
		fsp.readFile(resolve(frontendViteBuilt, 'loader/boot.js'), 'utf-8').catch(() => null),
		fsp.readFile(resolve(frontendViteBuilt, 'loader/style.css'), 'utf-8').catch(() => null),
		fsp.readFile(resolve(frontendEmbedViteBuilt, 'loader/boot.js'), 'utf-8').catch(() => null),
		fsp.readFile(resolve(frontendEmbedViteBuilt, 'loader/style.css'), 'utf-8').catch(() => null),
	]);

	if (deps.config.runtime.frontendManifestExists) {
		const manifestContent = await fsp.readFile(resolve(frontendViteBuilt, 'manifest.json'), 'utf-8').catch(() => null);
		state.frontendViteFiles = manifestContent ? collectViteAssetFiles(JSON.parse(manifestContent)) : null;
	}

	if (deps.config.runtime.frontendEmbedManifestExists) {
		const manifestContent = await fsp
			.readFile(resolve(frontendEmbedViteBuilt, 'manifest.json'), 'utf-8')
			.catch(() => null);
		state.frontendEmbedViteFiles = manifestContent ? collectViteAssetFiles(JSON.parse(manifestContent)) : null;
	}

	state.frontendBootloaderJs = bootJs;
	state.frontendBootloaderCss = bootCss;
	state.frontendEmbedBootloaderJs = embedBootJs;
	state.frontendEmbedBootloaderCss = embedBootCss;
}

export function createClientCommonDataLoader(deps: ClientCommonDataDependencies): () => Promise<CommonData> {
	const state = initialAssetState();

	return async () => {
		await prepareFrontendAssets(deps, state);

		return {
			version: deps.config.runtime.version,
			config: deps.config,
			langs: [...languages],
			instanceName: deps.meta.name ?? 'Toneriko',
			icon: deps.meta.iconUrl,
			appleTouchIcon: deps.meta.app512IconUrl,
			themeColor: deps.meta.themeColor,
			// 設定された画像だけを先読みする。未設定ではクライアントも画像を出さないので、外部の既定画像
			// (3 枚 73 KB) を先読みしても使われず、起動に要る読み込みと帯域を取り合うだけになる。
			serverErrorImageUrl: deps.meta.serverErrorImageUrl,
			infoImageUrl: deps.meta.infoImageUrl,
			notFoundImageUrl: deps.meta.notFoundImageUrl,
			instanceUrl: deps.config.instance.url,
			metaJson: htmlSafeJsonStringify(
				await packMetaDetailed(
					{
						config: deps.config,
						meta: deps.meta,
						db: deps.db,
					},
					deps.meta,
				),
			),
			now: Date.now(),
			federationEnabled: deps.meta.federation !== 'none',
			frontendViteFiles: state.frontendViteFiles,
			frontendBootloaderJs: state.frontendBootloaderJs,
			frontendBootloaderCss: state.frontendBootloaderCss,
			frontendEmbedViteFiles: state.frontendEmbedViteFiles,
			frontendEmbedBootloaderJs: state.frontendEmbedBootloaderJs,
			frontendEmbedBootloaderCss: state.frontendEmbedBootloaderCss,
		};
	};
}
