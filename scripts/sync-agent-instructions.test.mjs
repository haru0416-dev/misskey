/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

async function project() {
	const root = await mkdtemp(join(tmpdir(), 'misskey-agent-instructions-'));
	await mkdir(join(root, 'scripts'));
	await copyFile(
		new URL('./sync-agent-instructions.mjs', import.meta.url),
		join(root, 'scripts/sync-agent-instructions.mjs'),
	);
	await writeFile(join(root, 'AGENTS.md'), '# 共通契約\n\n未実行は成功としない。\n');
	await writeFile(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
	for (const name of [
		'working-on-backend',
		'working-on-frontend',
		'shipping-misskey-change',
		'creating-issues-and-prs',
		'context-budget',
	]) {
		const path = join(root, `.claude/skills/${name}/SKILL.md`);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `---\nname: ${name}\ndescription: "対象: ${name}"\n---\n\n# 正本\n`);
	}
	return root;
}

function run(root, mode) {
	const result = spawnSync(process.execPath, [join(root, 'scripts/sync-agent-instructions.mjs'), mode], {
		cwd: root,
		encoding: 'utf8',
	});
	if (result.error) throw result.error;
	return result;
}

test('check rejects drift without repairing it; explicit synchronization restores consistency', async () => {
	const root = await project();
	try {
		assert.equal(run(root, '--check').status, 1);
		assert.equal(run(root, '--write').status, 0);
		assert.equal(run(root, '--check').status, 0);
		const target = join(root, '.github/copilot-instructions.md');
		await writeFile(target, '誤って編集された生成先\n');
		assert.equal(run(root, '--check').status, 1);
		assert.equal(await readFile(target, 'utf8'), '誤って編集された生成先\n');
		assert.equal(run(root, '--write').status, 0);
		assert.equal(run(root, '--check').status, 0);
		await writeFile(join(root, '.agents/skills/working-on-backend/SKILL.md'), '古い入口\n');
		assert.equal(run(root, '--check').status, 1);
		assert.equal(run(root, '--write').status, 0);
		assert.equal(run(root, '--check').status, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('invalid canonical metadata prevents writes to all generated destinations', async () => {
	const root = await project();
	try {
		assert.equal(run(root, '--write').status, 0);
		const target = join(root, '.github/copilot-instructions.md');
		const before = await readFile(target, 'utf8');
		await writeFile(join(root, 'AGENTS.md'), '# 更新された共通契約\n');
		await writeFile(join(root, '.claude/skills/context-budget/SKILL.md'), '---\nname: context-budget\n---\n');
		assert.notEqual(run(root, '--write').status, 0);
		assert.equal(await readFile(target, 'utf8'), before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
