/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Docker イメージ用に、`bun install --production --filter backend` で入った依存から、本番バンドルが実行時に
// node_modules から読むもの (runtime-externals.mjs) とその推移的な依存だけを残す。ほかは built/ に束ね済み。
// 残した全パッケージの依存が解決できることを確かめ、欠けがあれば失敗する (実行時の読み込み失敗を先に止める)。
// 使い方: bun packages/backend/scripts/prune-runtime-modules.mjs <リポジトリの根>

import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { externalModules, pathLoadedModules } from '../runtime-externals.mjs';

const repoRoot = process.argv[2] ?? process.cwd();
const storeDir = join(repoRoot, 'node_modules/.bun');
const backendModules = join(repoRoot, 'packages/backend/node_modules');

// bun.lock は末尾カンマを許す JSON。packages は "配置名": ["名前@版", 取得元, { dependencies... }, 整合性] の形で、
// ワークスペースは ["名前@workspace:..."] だけを持つ。
const lock = JSON.parse(readFileSync(join(repoRoot, 'bun.lock'), 'utf8').replaceAll(/,(\s*[}\]])/g, '$1'));
const packages = new Map();
for (const [key, value] of Object.entries(lock.packages)) {
	const info = value[2] != null && typeof value[2] === 'object' ? value[2] : {};
	const optionalPeers = new Set(info.optionalPeers);
	const deps = [
		...Object.keys(info.dependencies ?? {}),
		...Object.keys(info.optionalDependencies ?? {}),
		...Object.keys(info.peerDependencies ?? {}).filter((name) => !optionalPeers.has(name)),
	];
	packages.set(key, { id: value[0], deps });
}

// 依存 "x" は、親の配置名の下に入れ子の "親/x" があればそれ、無ければ上位の "x" を指す。
function resolveKey(parentKey, dep) {
	const parts = parentKey.split('/');
	for (let i = parts.length; i > 0; i--) {
		const nested = `${parts.slice(0, i).join('/')}/${dep}`;
		if (packages.has(nested)) return nested;
	}
	return packages.has(dep) ? dep : undefined;
}

const isExternal = (name) =>
	externalModules.some((pattern) => (typeof pattern === 'string' ? pattern === name : pattern.test(name)));
const backendDeps = Object.keys(
	JSON.parse(readFileSync(join(repoRoot, 'packages/backend/package.json'), 'utf8')).dependencies ?? {},
);
const roots = [...new Set([...backendDeps.filter(isExternal), ...pathLoadedModules])];

const closure = new Set();
const stack = roots.filter((root) => packages.has(root));
while (stack.length > 0) {
	const key = stack.pop();
	if (closure.has(key)) continue;
	closure.add(key);
	for (const dep of packages.get(key).deps) {
		const next = resolveKey(key, dep);
		if (next != null && !closure.has(next)) stack.push(next);
	}
}
const keepIds = new Set([...closure].map((key) => packages.get(key).id));

// store のディレクトリ名は "名前(/ を + に)@版" に、必要なら "+ハッシュ16桁" が付く。
function storeEntryId(entry) {
	const base = entry.replace(/\+[0-9a-f]{16}$/, '');
	const at = base.lastIndexOf('@');
	return `${base.slice(0, at).replace('+', '/')}${base.slice(at)}`;
}

let removed = 0;
for (const entry of readdirSync(storeDir)) {
	if (entry === 'node_modules') continue;
	if (!keepIds.has(storeEntryId(entry))) {
		rmSync(join(storeDir, entry), { recursive: true, force: true });
		removed++;
	}
}

// 消した先を指すリンク (切れたリンク) を、backend 直下と store の巻き上げ場所から取り除く。
function removeDanglingLinks(dir) {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) {
			if (!existsSync(path)) rmSync(path);
		} else if (stat.isDirectory() && (name.startsWith('@') || name === '.bin')) {
			removeDanglingLinks(path);
		}
	}
}
removeDanglingLinks(backendModules);
removeDanglingLinks(join(storeDir, 'node_modules'));

// 残したパッケージの必須の依存と、起点が実際に解決できることを確かめる。
const missing = [];
for (const root of roots) {
	if (!existsSync(join(backendModules, root))) missing.push(`packages/backend -> ${root}`);
}
for (const entry of readdirSync(storeDir)) {
	if (entry === 'node_modules') continue;
	const modules = join(storeDir, entry, 'node_modules');
	const name = storeEntryId(entry).replace(/@[^@]+$/, '');
	const manifestPath = join(modules, name, 'package.json');
	if (!existsSync(manifestPath)) continue;
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const optionalPeers = new Set(
		Object.entries(manifest.peerDependenciesMeta ?? {})
			.filter(([, meta]) => meta?.optional)
			.map(([peer]) => peer),
	);
	const required = [
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}).filter((peer) => !optionalPeers.has(peer)),
	];
	for (const dep of required) {
		if (!existsSync(join(modules, dep))) missing.push(`${entry} -> ${dep}`);
	}
}

console.log(`prune-runtime-modules: roots=${roots.length} kept=${keepIds.size} removed=${removed}`);
if (missing.length > 0) {
	console.error(`prune-runtime-modules: unresolved dependencies after pruning:\n  ${missing.join('\n  ')}`);
	process.exit(1);
}
