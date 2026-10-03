/// <reference types="vitest/config" />
import path from 'node:path';
import pluginVue from '@vitejs/plugin-vue';
import pluginGlsl from 'vite-plugin-glsl';
import { visualizer } from 'rollup-plugin-visualizer';
import type { PluginOption, ServerOptions, UserConfig } from 'vite';
import { defineConfig } from 'vite';
import { promises as fsp } from 'node:fs';
import { parse } from 'yaml';

import locales from 'i18n';
import meta from '../../package.json' with { type: 'json' };
import packageInfo from './package.json' with { type: 'json' };
import pluginUnwindCssModuleClassName from './builder/rollup-plugin-unwind-css-module-class-name.js';
import pluginJson5 from './builder/vite-plugin-json5.js';
import type { Options as SearchIndexOptions } from './builder/vite-plugin-create-search-index.js';
import pluginCreateSearchIndex from './builder/vite-plugin-create-search-index.js';
import pluginWatchLocales from './builder/vite-plugin-watch-locales.js';
import { pluginRemoveUnrefI18n } from './builder/rollup-plugin-remove-unref-i18n.js';
import { Features } from 'lightningcss';
import { hash, toBase62 } from './builder/utils.js';

// バックエンドと同じ設定ファイルから URL を読み、そのホスト名だけを Vite に許可する。
const url =
	process.env.NODE_ENV === 'development'
		? (parse(await fsp.readFile(`../../.config/${process.env['MISSKEY_CONFIG_YML'] ?? 'default.yml'}`, 'utf-8')) as any)
				.instance.url
		: null;
const host = url ? new URL(url).hostname : undefined;

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.json5', '.svg', '.sass', '.scss', '.css', '.vue'];

function getBundleVisualizerPlugin(): PluginOption[] {
	if (process.env.FRONTEND_BUNDLE_VISUALIZER !== 'true') {
		return [];
	}

	const visualizerOptions = {
		title: 'Toneriko frontend bundle visualizer',
		gzipSize: true,
		brotliSize: true,
		projectRoot: path.resolve(import.meta.dirname, '../..'),
	};
	const plugins = [
		visualizer({
			...visualizerOptions,
			filename: process.env.FRONTEND_BUNDLE_VISUALIZER_FILE,
			template: 'raw-data',
		}) as PluginOption,
	];

	if (process.env.FRONTEND_BUNDLE_VISUALIZER_HTML_FILE != null) {
		plugins.push(
			visualizer({
				...visualizerOptions,
				filename: process.env.FRONTEND_BUNDLE_VISUALIZER_HTML_FILE,
				template: 'treemap',
			}) as PluginOption,
		);
	}

	return plugins;
}

export const searchIndexes = [
	{
		targetFilePaths: ['src/pages/settings/**/*.vue'],
		mainVirtualModule: 'search-index:settings',
		modulesToHmrOnUpdate: ['src/pages/settings/index.vue'],
		verbose: process.env.FRONTEND_SEARCH_INDEX_VERBOSE === 'true',
	},
	{
		targetFilePaths: ['src/pages/admin/**/*.vue'],
		mainVirtualModule: 'search-index:admin',
		modulesToHmrOnUpdate: ['src/pages/admin/index.vue'],
		verbose: process.env.FRONTEND_SEARCH_INDEX_VERBOSE === 'true',
	},
] satisfies SearchIndexOptions[];

/**
 * Misskeyのフロントエンドにバンドルせず、CDNなどから別途読み込むリソースを記述する。
 * CDN を使わずにバンドルする場合は、以下の配列から該当要素を削除する。
 */
const externalPackages = [
	// shiki（コードブロックのシンタックスハイライトで使用中）はテーマ・言語の定義の容量が大きいため、それらはCDNから読み込む
	{
		name: 'shiki',
		match: /^shiki\/(?<subPkg>(langs|themes))$/,
		path(id: string, pattern: RegExp): string {
			const match = pattern.exec(id)?.groups;
			return match ? `https://esm.sh/shiki@${packageInfo.dependencies.shiki}/${match['subPkg']}` : id;
		},
	},
];

// 起動処理 (main-boot) から静的にたどれるモジュールの集合。ビルドごとに 1 度だけ求める。
let startupModuleIds: Set<string> | null = null;
function isStartupModule(
	id: string,
	ctx: { getModuleInfo(id: string): { importedIds: readonly string[] } | null },
): boolean {
	if (startupModuleIds == null) {
		const ids = new Set<string>();
		const stack = [path.resolve(import.meta.dirname, 'src/boot/main-boot.ts')];
		for (let current = stack.pop(); current != null; current = stack.pop()) {
			if (ids.has(current)) continue;
			const info = ctx.getModuleInfo(current);
			if (info == null) continue;
			ids.add(current);
			stack.push(...info.importedIds);
		}
		startupModuleIds = ids;
	}
	return startupModuleIds.has(id);
}

/** 開発サーバーの設定。本体と埋め込みは、ポートと HMR の接続先を別の環境変数で変える。 */
export function getDevServerConfig(portEnv: string, hmrClientPortEnv: string, defaultPort: number): ServerOptions {
	// tailscale などで別のポートから開くときに、デフォルトのポートと HMR の接続先を環境変数で変える。
	const port = Number(process.env[portEnv] ?? defaultPort);
	const hmrClientPort = Number(process.env[hmrClientPortEnv] ?? port);

	return {
		// バックエンドが任意のアドレスからの接続を受け付けるため、Vite も全アドレスで待ち受ける。
		host: '0.0.0.0',
		allowedHosts: host ? [host] : undefined,
		port,
		strictPort: true,
		hmr: {
			// バックエンド経由ではアセットが 3000 から配信され、HMR の WS がバックエンドの WS サーバーに吸収される。
			// 接続先を Vite のポートに固定する。
			clientPort: hmrClientPort,
		},
	};
}

/** 本体と埋め込み (vite.embed.config.ts) のビルドで共通の設定。 */
export function getSharedConfig() {
	const localesHash = toBase62(hash(JSON.stringify(locales)));

	return {
		// Vite のログ出力はバックエンドと共有されるため、コンソールをクリアしない。
		clearScreen: false,

		resolve: {
			extensions,
			alias: {
				'@/': `${path.join(import.meta.dirname, 'src')}/`,
				'/client-assets/': `${path.join(import.meta.dirname, 'assets')}/`,
				'/static-assets/': `${path.join(import.meta.dirname, '../backend/assets')}/`,
				'/fluent-emoji/': '@misskey-dev/emoji-assets/fluent-emoji/',
			},
		},

		css: {
			lightningcss: {
				exclude: Features.LightDark,
			},
			modules: {
				generateScopedName(name: string, filename: string, _css: string): string {
					const id = (path.relative(import.meta.dirname, filename.split('?')[0]) + '-' + name)
						.replaceAll(/[\\\/\.\?&=]/g, '-')
						.replaceAll(/(src-|vue-)/g, '');
					if (process.env.NODE_ENV === 'production') {
						return 'x' + toBase62(hash(id)).substring(0, 4);
					}
					return id;
				},
			},
		},

		define: {
			_VERSION_: JSON.stringify(meta.version),
			_LANGS_: JSON.stringify(Object.entries(locales).map(([k, v]) => [k, v._lang_])),
			_ENV_: JSON.stringify(process.env.NODE_ENV),
			_DEV_: process.env.NODE_ENV !== 'production',
			_PERF_PREFIX_: JSON.stringify('Toneriko:'),
			__VUE_OPTIONS_API__: false,
			__VUE_PROD_DEVTOOLS__: false,
		},

		build: {
			target: ['chrome130', 'firefox132', 'safari18.2'],
			manifest: 'manifest.json',
			cssCodeSplit: true,
			assetsDir: '.',
			emptyOutDir: false,
			sourcemap: process.env.NODE_ENV === 'development',
			reportCompressedSize: false,
		},

		output: {
			entryFileNames: `scripts/${localesHash}-[hash:8].js`,
			chunkFileNames: `scripts/${localesHash}-[hash:8].js`,
			assetFileNames: `assets/${localesHash}-[hash:8][extname]`,
		},

		worker: {
			format: 'es',
		},
	} satisfies UserConfig & { output: object };
}

export function getConfig(): UserConfig {
	const { output, ...shared } = getSharedConfig();

	return {
		...shared,
		base: '/vite/',

		server: {
			...getDevServerConfig('MISSKEY_VITE_PORT', 'MISSKEY_VITE_HMR_CLIENT_PORT', 5173),
			headers: {
				'X-Frame-Options': 'DENY',
			},
		},

		plugins: [
			pluginWatchLocales(),
			...searchIndexes.map((options) => pluginCreateSearchIndex(options)),
			pluginVue(),
			pluginRemoveUnrefI18n(),
			pluginUnwindCssModuleClassName(),
			pluginJson5(),
			pluginGlsl({ minify: true }),
			...getBundleVisualizerPlugin(),
		],

		build: {
			...shared.build,
			rolldownOptions: {
				experimental: {
					nativeMagicString: true,
				},
				input: {
					i18n: './src/i18n.ts',
					entry: './src/boot/entry.ts',
				},
				external: externalPackages.map((p) => p.match),
				preserveEntrySignatures: 'allow-extension',
				output: {
					...output,
					codeSplitting: {
						groups: [
							{
								name: 'vue',
								test: /node_modules[\\/]vue/,
							},
							{
								// ECharts は管理画面/アクティビティpage等から利用されるため、
								// 個別ページのコード変更でvendorチャンクのハッシュが変わりキャッシュが無効化されるのを防ぐ
								name: 'chart',
								test: /node_modules[\\/](echarts|zrender)[\\/]/,
							},
							{
								// ロケール変更時もアプリ本体のキャッシュを再利用できるよう、i18n 関連モジュールを分離する。
								name: 'i18n',
								includeDependenciesRecursively: false,
								test: /i18n\.ts|locale\.ts/,
							},
							{
								// 自動の分割は、到達元の組み合わせごとにチャンクを分ける。起動時に必ず読むコードも数十の小さな
								// チャンクに割れ、チャンク間の import と先読みの一覧が増える。起動時に読むものは 1 つにまとめる。
								name: (id, ctx) => (isStartupModule(id, ctx) ? 'startup' : null),
							},
						],
					},
					paths(id) {
						for (const p of externalPackages) {
							if (p.match.test(id)) {
								return p.path(id, p.match);
							}
						}

						return id;
					},
				},
			},
			outDir: path.join(import.meta.dirname, '../../built/_frontend_vite_'),
		},

		test: {
			environment: 'happy-dom',
			setupFiles: ['./test/init.ts'],
		},
	};
}

const config = defineConfig(getConfig());

export default config;
