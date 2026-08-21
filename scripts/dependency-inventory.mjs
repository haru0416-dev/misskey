/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const dependencyGroups = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx', '.vue']);

const bunNativeCandidates = {
	'cross-env': {
		status: 'replace',
		api: 'Bun shell environment assignment',
		note: 'Bun package scripts support cross-platform environment assignment.',
	},
	uuid: {
		status: 'replace',
		api: 'crypto.randomUUID() / Bun.randomUUIDv7()',
		note: 'The current AiScript use only generates UUID v4 values.',
	},
	semver: {
		status: 'evaluate',
		api: 'Bun.semver',
		note: 'Current includePrerelease behavior must be checked for exact compatibility.',
	},
	pg: {
		status: 'evaluate',
		api: 'Bun.SQL',
		note: 'Production already uses Bun.SQL; pg remains for Node-based tools and tests.',
	},
	ioredis: {
		status: 'retain',
		api: 'Bun.RedisClient',
		note: 'BullMQ and the existing Pub/Sub/event API depend on ioredis compatibility.',
	},
	tar: {
		status: 'evaluate',
		api: 'Bun.Archive',
		note: 'The tracked-file streaming tarball needs reproducibility and memory-use comparison.',
	},
	archiver: {
		status: 'retain',
		api: 'Bun.Archive',
		note: 'Bun.Archive does not replace ZIP and streaming append behavior.',
	},
	ws: {
		status: 'evaluate',
		api: 'WebSocket / Bun.serve()',
		note: 'The native API is not drop-in compatible with ws server and test helpers.',
	},
	chokidar: {
		status: 'retain',
		api: 'bun --watch',
		note: 'Bun watch mode is not a general-purpose file watcher library API.',
	},
	minimatch: {
		status: 'evaluate',
		api: 'Bun.Glob',
		note: 'Confirm pattern and option compatibility before replacing matching logic.',
	},
	'mime-types': {
		status: 'evaluate',
		api: 'Bun.file().type',
		note: 'Only extension-based MIME lookup is replaceable.',
	},
	'file-type': {
		status: 'retain',
		api: 'none',
		note: 'Bun.file().type does not inspect magic bytes.',
	},
	'node-html-parser': {
		status: 'retain',
		api: 'HTMLRewriter',
		note: 'HTMLRewriter streams transformations but does not provide a DOM tree.',
	},
	vitest: {
		status: 'retain',
		api: 'bun:test',
		note: 'The suite relies on Vitest configuration and ecosystem compatibility.',
	},
};

export function parseResolvedPackage(resolved) {
	const separator = resolved.startsWith('@') ? resolved.indexOf('@', resolved.indexOf('/') + 1) : resolved.indexOf('@');
	if (separator < 0) return { name: resolved, version: 'unknown' };
	return {
		name: resolved.slice(0, separator),
		version: resolved.slice(separator + 1),
	};
}

function packageNameFromSpecifier(specifier) {
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('#') ||
		specifier.startsWith('node:')
	) {
		return null;
	}
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function trackedSourceFiles(root) {
	const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
	return result.stdout
		.split('\0')
		.filter((file) => sourceExtensions.has(extname(file)) && existsSync(`${root}/${file}`));
}

function collectSourceUsage(root) {
	const usage = new Map();
	const importPatterns = [
		/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g,
		/\bimport\s*['"]([^'"]+)['"]/g,
	];

	for (const file of trackedSourceFiles(root)) {
		const source = readFileSync(`${root}/${file}`, 'utf8');
		for (const pattern of importPatterns) {
			for (const match of source.matchAll(pattern)) {
				const packageName = packageNameFromSpecifier(match[1]);
				if (packageName == null) continue;
				if (!usage.has(packageName)) usage.set(packageName, new Set());
				usage.get(packageName).add(file);
			}
		}
	}

	return usage;
}

function collectScriptUsage(workspaces) {
	const usage = new Map();
	for (const [workspacePath, workspace] of Object.entries(workspaces)) {
		for (const [scriptName, script] of Object.entries(workspace.scripts ?? {})) {
			for (const packageName of Object.keys(bunNativeCandidates)) {
				if (
					!new RegExp(`(^|[^\\w@/-])${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w@/-]|$)`).test(script)
				) {
					continue;
				}
				if (!usage.has(packageName)) usage.set(packageName, new Set());
				usage.get(packageName).add(`${workspacePath || '.'}:script:${scriptName}`);
			}
		}
	}
	return usage;
}

function mergeUsage(sourceUsage, scriptUsage) {
	const result = new Map(sourceUsage);
	for (const [packageName, locations] of scriptUsage) {
		if (!result.has(packageName)) result.set(packageName, new Set());
		for (const location of locations) result.get(packageName).add(location);
	}
	return result;
}

function buildNameGraph(packages) {
	// バージョン別ノードをpackage名へ畳み、導入元の概観を優先する。版ごとの経路差が判断材料になったらノード単位へ拡張する。
	const graph = new Map();
	const reverse = new Map();
	const versions = new Map();

	for (const tuple of Object.values(packages)) {
		const { name, version } = parseResolvedPackage(tuple[0]);
		if (!graph.has(name)) graph.set(name, new Set());
		if (!versions.has(name)) versions.set(name, new Set());
		versions.get(name).add(version);

		const metadata = tuple[2] ?? {};
		for (const group of ['dependencies', 'optionalDependencies']) {
			for (const dependencyName of Object.keys(metadata[group] ?? {})) {
				graph.get(name).add(dependencyName);
				if (!reverse.has(dependencyName)) reverse.set(dependencyName, new Set());
				reverse.get(dependencyName).add(name);
			}
		}
	}

	return { graph, reverse, versions };
}

export function dependencyClosure(graph, rootName) {
	const visited = new Set();
	const pending = [rootName];
	while (pending.length > 0) {
		const name = pending.pop();
		if (visited.has(name)) continue;
		visited.add(name);
		for (const dependency of graph.get(name) ?? []) pending.push(dependency);
	}
	return visited;
}

function workspaceDirectDependencies(workspaces) {
	const result = new Map();
	for (const [workspacePath, workspace] of Object.entries(workspaces)) {
		for (const group of dependencyGroups) {
			for (const [name, requested] of Object.entries(workspace[group] ?? {})) {
				if (!result.has(name)) result.set(name, []);
				result.get(name).push({ workspace: workspacePath || '.', group, requested });
			}
		}
	}
	return result;
}

function buildInventory(lock, usage) {
	const { graph, reverse, versions } = buildNameGraph(lock.packages);
	const direct = workspaceDirectDependencies(lock.workspaces);
	const workspaceRows = Object.entries(lock.workspaces).map(([workspacePath, workspace]) => {
		const groups = Object.fromEntries(
			dependencyGroups.map((group) => [group, Object.keys(workspace[group] ?? {}).length]),
		);
		return { workspace: workspacePath || '.', name: workspace.name ?? null, ...groups };
	});

	const rootRows = [...direct]
		.map(([name, declarations]) => ({
			name,
			declarations,
			transitivePackages: Math.max(0, dependencyClosure(graph, name).size - 1),
			usage: [...(usage.get(name) ?? [])].toSorted(),
		}))
		.toSorted((a, b) => b.transitivePackages - a.transitivePackages || a.name.localeCompare(b.name));

	const duplicateRows = [...versions]
		.filter(([, packageVersions]) => packageVersions.size > 1)
		.map(([name, packageVersions]) => ({ name, versions: [...packageVersions].toSorted() }))
		.toSorted((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));

	const nativeRows = Object.entries(bunNativeCandidates)
		.filter(([name]) => direct.has(name))
		.map(([name, candidate]) => ({
			name,
			...candidate,
			declarations: direct.get(name),
			transitivePackages: Math.max(0, dependencyClosure(graph, name).size - 1),
			usage: [...(usage.get(name) ?? [])].toSorted(),
		}));

	return {
		summary: {
			workspaces: workspaceRows.length,
			directPackageNames: direct.size,
			resolvedInstances: Object.keys(lock.packages).length,
			resolvedPackageNames: versions.size,
			packagesWithMultipleVersions: duplicateRows.length,
		},
		workspaces: workspaceRows,
		directRoots: rootRows,
		duplicates: duplicateRows,
		nativeCandidates: nativeRows,
		graph,
		reverse,
		versions,
		direct,
	};
}

function selectedPackageReport(inventory, packageName, usage) {
	const directRoots = inventory.directRoots
		.filter((root) => dependencyClosure(inventory.graph, root.name).has(packageName))
		.map((root) => root.name);
	return {
		name: packageName,
		versions: [...(inventory.versions.get(packageName) ?? [])].toSorted(),
		directDeclarations: inventory.direct.get(packageName) ?? [],
		directParents: [...(inventory.reverse.get(packageName) ?? [])].toSorted(),
		introducedByDirectRoots: directRoots.toSorted(),
		usage: [...(usage.get(packageName) ?? [])].toSorted(),
		bunNative: bunNativeCandidates[packageName] ?? null,
	};
}

function escapeCell(value) {
	return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function renderTable(headers, rows) {
	return [
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
	].join('\n');
}

function renderMarkdown(inventory, selected) {
	const lines = [
		'# Dependency Inventory',
		'',
		`- Workspaces: ${inventory.summary.workspaces}`,
		`- Direct package names: ${inventory.summary.directPackageNames}`,
		`- Resolved package instances: ${inventory.summary.resolvedInstances}`,
		`- Resolved package names: ${inventory.summary.resolvedPackageNames}`,
		`- Packages with multiple versions: ${inventory.summary.packagesWithMultipleVersions}`,
	];

	if (selected != null) {
		lines.push(
			'',
			`## Package: ${selected.name}`,
			'',
			`- Versions: ${selected.versions.join(', ') || '(not resolved)'}`,
			`- Direct declarations: ${selected.directDeclarations.map((item) => `${item.workspace}:${item.group}`).join(', ') || '(none)'}`,
			`- Direct parents: ${selected.directParents.join(', ') || '(none)'}`,
			`- Introduced by direct roots: ${selected.introducedByDirectRoots.join(', ') || '(none)'}`,
			`- Source/script uses: ${selected.usage.length}`,
			'',
			...selected.usage.slice(0, 100).map((location) => `- \`${location}\``),
		);
		return `${lines.join('\n')}\n`;
	}

	lines.push(
		'',
		'## Bun Native Candidates',
		'',
		renderTable(
			['Package', 'Decision', 'Bun API', 'Transitive', 'Uses', 'Constraint'],
			inventory.nativeCandidates.map((row) => [
				row.name,
				row.status,
				row.api,
				row.transitivePackages,
				row.usage.length,
				row.note,
			]),
		),
		'',
		'## Largest Direct Dependency Trees',
		'',
		renderTable(
			['Package', 'Transitive packages', 'Declared by', 'Uses'],
			inventory.directRoots
				.slice(0, 30)
				.map((row) => [
					row.name,
					row.transitivePackages,
					row.declarations.map((item) => `${item.workspace}:${item.group}`).join(', '),
					row.usage.length,
				]),
		),
		'',
		'## Duplicate Versions',
		'',
		renderTable(
			['Package', 'Versions'],
			inventory.duplicates.slice(0, 50).map((row) => [row.name, row.versions.join(', ')]),
		),
		'',
		'## Workspaces',
		'',
		renderTable(
			['Workspace', 'Production', 'Development', 'Optional', 'Peer'],
			inventory.workspaces.map((row) => [
				row.workspace,
				row.dependencies,
				row.devDependencies,
				row.optionalDependencies,
				row.peerDependencies,
			]),
		),
	);

	return `${lines.join('\n')}\n`;
}

function parseArgs(args) {
	let json = false;
	let packageName = null;
	for (let index = 0; index < args.length; index++) {
		if (args[index] === '--json') json = true;
		else if (args[index] === '--package' && args[index + 1] != null) packageName = args[++index];
		else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
	}
	return { json, packageName };
}

export function createDependencyInventory(root = process.cwd()) {
	const lock = Bun.JSONC.parse(readFileSync(`${root}/bun.lock`, 'utf8'));
	const manifests = Object.fromEntries(
		Object.keys(lock.workspaces).map((workspacePath) => {
			const packagePath = workspacePath === '' ? 'package.json' : `${workspacePath}/package.json`;
			return [workspacePath, JSON.parse(readFileSync(`${root}/${packagePath}`, 'utf8'))];
		}),
	);
	const usage = mergeUsage(collectSourceUsage(root), collectScriptUsage(manifests));
	return { inventory: buildInventory(lock, usage), usage };
}

if (import.meta.main) {
	try {
		const options = parseArgs(process.argv.slice(2));
		const { inventory, usage } = createDependencyInventory();
		const selected = options.packageName == null ? null : selectedPackageReport(inventory, options.packageName, usage);
		if (options.json) {
			console.log(
				JSON.stringify(
					{
						summary: inventory.summary,
						workspaces: inventory.workspaces,
						directRoots: inventory.directRoots,
						duplicates: inventory.duplicates,
						nativeCandidates: inventory.nativeCandidates,
						selected,
					},
					null,
					2,
				),
			);
		} else {
			process.stdout.write(renderMarkdown(inventory, selected));
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
