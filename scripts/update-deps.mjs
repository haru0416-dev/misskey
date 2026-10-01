/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// メジャー更新は適用せず、同じ互換範囲で公開後の経過期間を満たす版だけを選ぶ。
// --write は package.json のみを更新し、bun.lock は後続の bun install で更新する。
//
// 使い方: bun scripts/update-deps.mjs [--write] [--report <path>]

import { readFileSync, writeFileSync } from 'node:fs';

const dependencyGroups = ['dependencies', 'devDependencies', 'optionalDependencies'];
const exactVersion = /^\d+\.\d+\.\d+$/;
const DEFAULT_MIN_AGE_SECONDS = 7 * 24 * 60 * 60;

// 対応できないメジャーを明示し、次のメジャーが出た場合は再び判断対象にする。
const heldMajors = {
	typescript: {
		major: 7,
		reason:
			'TypeScript 7 は JS API を持たず、vue-tsc・i18n の型生成・misskey-js の generator が 6 系を要する (型検査は typescript-native の 7 で実行済み)',
	},
};
const FETCH_CONCURRENCY = 8;

function parseVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}

// 0.x.y は 0.x の中、0.0.x はその版だけを互換とみなす (semver の ^ と同じ扱い)。
function isCompatible(current, candidate) {
	if (current[0] !== 0) return candidate[0] === current[0];
	if (current[1] !== 0) return candidate[0] === 0 && candidate[1] === current[1];
	return compareVersions(candidate, current) === 0;
}

/**
 * @param {string} current 現在の版 (x.y.z)
 * @param {{ version: string, time: number, deprecated: boolean }[]} versions レジストリにある版
 * @param {number} now 現在時刻 (ms)
 * @param {number} minAgeMs 公開からこれより新しい版は選ばない
 * @returns {{ compatible: string | null, major: string | null }} 互換範囲で最新の版と、それより新しいメジャーの最新版
 */
export function pickUpdate(current, versions, now, minAgeMs) {
	const base = parseVersion(current);
	if (base == null) return { compatible: null, major: null };

	let compatible = null;
	let major = null;
	for (const entry of versions) {
		// 公開日時が無い版 (NaN) は経過期間を確かめられないので選ばない。
		if (entry.deprecated || !(now - entry.time >= minAgeMs)) continue;
		const parsed = parseVersion(entry.version);
		if (parsed == null || compareVersions(parsed, base) <= 0) continue;
		if (isCompatible(base, parsed)) {
			if (compatible == null || compareVersions(parsed, compatible) > 0) compatible = parsed;
		} else if (major == null || compareVersions(parsed, major) > 0) {
			major = parsed;
		}
	}
	return { compatible: compatible?.join('.') ?? null, major: major?.join('.') ?? null };
}

function readMinAgeSeconds() {
	const bunfig = readFileSync('bunfig.toml', 'utf8');
	const match = /^minimumReleaseAge\s*=\s*(\d+)/m.exec(bunfig);
	return match ? Number(match[1]) : DEFAULT_MIN_AGE_SECONDS;
}

function readManifests() {
	const root = JSON.parse(readFileSync('package.json', 'utf8'));
	const paths = ['package.json', ...root.workspaces.map((workspace) => `${workspace}/package.json`)];
	return paths.map((path) => {
		const text = readFileSync(path, 'utf8');
		const json = JSON.parse(text);
		// 書き戻しで差分を出さないため、整形が JSON.stringify のタブ字下げと一致する前提を確かめる。
		if (`${JSON.stringify(json, null, '\t')}\n` !== text) {
			throw new Error(`${path} is not formatted as tab-indented JSON; refusing to rewrite it`);
		}
		return { path, json };
	});
}

async function fetchVersions(name) {
	const registry = (process.env.npm_config_registry ?? 'https://registry.npmjs.org').replace(/\/$/, '');
	const response = await fetch(`${registry}/${name.replace('/', '%2f')}`, { headers: { accept: 'application/json' } });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const packument = await response.json();
	return Object.entries(packument.versions ?? {}).map(([version, manifest]) => ({
		version,
		time: Date.parse(packument.time?.[version] ?? ''),
		deprecated: manifest.deprecated != null,
	}));
}

async function mapConcurrent(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	});
	await Promise.all(workers);
	return results;
}

/**
 * @param {{ name: string, from: string, to: string }[]} majors
 * @param {Record<string, { major: number, reason: string }>} held
 * @returns {{ pending: typeof majors, held: (typeof majors[number] & { reason: string })[] }}
 */
export function splitHeldMajors(majors, held) {
	const pending = [];
	const kept = [];
	for (const entry of majors) {
		const hold = Object.hasOwn(held, entry.name) ? held[entry.name] : undefined;
		if (hold != null && parseVersion(entry.to)?.[0] === hold.major) {
			kept.push({ ...entry, reason: hold.reason });
		} else {
			pending.push(entry);
		}
	}
	return { pending, held: kept };
}

function renderReport({ updated, majors, held, failures, minAgeSeconds }) {
	const lines = [];
	const days = minAgeSeconds / 86400;
	lines.push(`公開から ${days} 日以上経った版のうち、同じメジャー (0.x は同じマイナー) の最新へ更新します。`, '');
	if (updated.length > 0) {
		lines.push('### 更新', '', '| パッケージ | 現在 | 更新後 |', '| --- | --- | --- |');
		for (const { name, from, to } of updated) lines.push(`| \`${name}\` | ${from} | ${to} |`);
		lines.push('');
	}
	if (majors.length > 0) {
		lines.push(
			'### メジャー更新あり (このPRでは更新しない)',
			'',
			'| パッケージ | 現在 | 最新 |',
			'| --- | --- | --- |',
		);
		for (const { name, from, to } of majors) lines.push(`| \`${name}\` | ${from} | ${to} |`);
		lines.push('');
	}
	if (held.length > 0) {
		lines.push(
			'### 据え置き (理由が解消するまで上げない)',
			'',
			'| パッケージ | 現在 | 最新 | 理由 |',
			'| --- | --- | --- | --- |',
		);
		for (const { name, from, to, reason } of held) lines.push(`| \`${name}\` | ${from} | ${to} | ${reason} |`);
		lines.push('');
	}
	if (failures.length > 0) {
		lines.push('### 取得に失敗したパッケージ (確認していない)', '');
		for (const { name, error } of failures) lines.push(`- \`${name}\`: ${error}`);
		lines.push('');
	}
	return lines.join('\n');
}

async function main() {
	const args = process.argv.slice(2);
	const write = args.includes('--write');
	const reportIndex = args.indexOf('--report');
	const reportPath = reportIndex === -1 ? null : args[reportIndex + 1];

	const minAgeSeconds = readMinAgeSeconds();
	const manifests = readManifests();

	// 同じパッケージは全ワークスペースで同じ版へそろえるため、名前ごとにまとめる。
	const currentByName = new Map();
	for (const { json } of manifests) {
		for (const group of dependencyGroups) {
			for (const [name, spec] of Object.entries(json[group] ?? {})) {
				if (!exactVersion.test(spec)) continue;
				const known = currentByName.get(name);
				if (known == null || compareVersions(parseVersion(spec), parseVersion(known)) < 0) {
					currentByName.set(name, spec);
				}
			}
		}
	}

	const names = [...currentByName.keys()].sort();
	const now = Date.now();
	const failures = [];
	const picks = await mapConcurrent(names, FETCH_CONCURRENCY, async (name) => {
		try {
			return pickUpdate(currentByName.get(name), await fetchVersions(name), now, minAgeSeconds * 1000);
		} catch (error) {
			failures.push({ name, error: error instanceof Error ? error.message : String(error) });
			return { compatible: null, major: null };
		}
	});

	const updated = [];
	const majors = [];
	const targetByName = new Map();
	names.forEach((name, index) => {
		const from = currentByName.get(name);
		const { compatible, major } = picks[index];
		if (compatible != null) {
			updated.push({ name, from, to: compatible });
			targetByName.set(name, compatible);
		}
		if (major != null) majors.push({ name, from: compatible ?? from, to: major });
	});
	failures.sort((a, b) => a.name.localeCompare(b.name));

	if (write) {
		for (const { path, json } of manifests) {
			let changed = false;
			for (const group of dependencyGroups) {
				for (const [name, spec] of Object.entries(json[group] ?? {})) {
					const target = targetByName.get(name);
					if (target != null && exactVersion.test(spec) && spec !== target) {
						json[group][name] = target;
						changed = true;
					}
				}
			}
			if (changed) writeFileSync(path, `${JSON.stringify(json, null, '\t')}\n`);
		}
	}

	const { pending, held } = splitHeldMajors(majors, heldMajors);
	const report = renderReport({ updated, majors: pending, held, failures, minAgeSeconds });
	if (reportPath != null) writeFileSync(reportPath, report);
	console.log(report);
	console.log(`updated=${updated.length} majors=${pending.length} held=${held.length} failures=${failures.length}`);
}

if (import.meta.main) {
	await main();
}
