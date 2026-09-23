/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const command = async (argv: string[]) => {
	const process = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code !== 0) throw new Error(`${argv[0]} failed: ${stderr}`);
	return stdout.trim();
};

async function buildIdentity(repo: string) {
	const build = createHash('sha256');
	const addFile = async (path: string) => {
		build
			.update(path)
			.update('\0')
			.update(hash(await readFile(resolve(repo, path))))
			.update('\0');
	};
	const visit = async (path: string): Promise<void> => {
		const entries = await readdir(resolve(repo, path), { withFileTypes: true });
		entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		for (const entry of entries) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) await visit(child);
			else if (entry.isFile()) await addFile(child);
			else throw new Error(`Unsupported build artifact: ${child}`);
		}
	};
	// entry.js が同じでも分割 chunk や外部化したネイティブ成果物が変わるため、入口だけでは版を固定できない。
	await visit('packages/backend/built');
	const nativeFiles = (await readdir(resolve(repo, 'packages/slacc')))
		.filter((name) => name === 'package.json' || /\.(cjs|mjs|node)$/.test(name))
		.sort();
	if (!nativeFiles.some((name) => name.endsWith('.node'))) throw new Error('Missing slacc native build');
	for (const name of nativeFiles) await addFile(join('packages/slacc', name));
	return build.digest('hex');
}

const [repo, configPath, ...pidArguments] = Bun.argv.slice(2);
if (!repo || !configPath || pidArguments.length === 0)
	throw new Error('Usage: bun identity.mts REPO COMPILED_CONFIG PID... (host-visible application and worker PIDs)');
const pids = pidArguments.map(Number);
if (pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 1)) throw new Error('Invalid PID');
const processes = await Promise.all(
	pids.map(async (pid) => ({
		pid,
		executable: await readlink(`/proc/${pid}/exe`),
		version: await command([`/proc/${pid}/exe`, '--version']),
		commandLine: (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean),
		environment: (await readFile(`/proc/${pid}/environ`, 'utf8'))
			.split('\0')
			.filter((entry) => /^(NODE_ENV|MK_DB_DRIVER|MK_DISABLE_CLUSTERING|MK_ONLY_SERVER|MK_NO_DAEMONS)=/.test(entry)),
	})),
);
console.log(
	JSON.stringify(
		{
			processes,
			revision: await command(['git', '-C', repo, 'rev-parse', 'HEAD']),
			workingDiffSha256: hash(await command(['git', '-C', repo, 'diff', '--binary', 'HEAD'])),
			workingStatus: await command(['git', '-C', repo, 'status', '--porcelain']),
			lockSha256: hash(await readFile(resolve(repo, 'bun.lock'))),
			configSha256: hash(await readFile(resolve(configPath))),
			buildSha256: await buildIdentity(repo),
			clockTicksPerSecond: Number(await command(['getconf', 'CLK_TCK'])),
			kernel: await command(['uname', '-srmo']),
		},
		null,
		2,
	),
);
