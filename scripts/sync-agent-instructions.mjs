/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const skillNames = [
	'working-on-backend',
	'working-on-frontend',
	'shipping-misskey-change',
	'creating-issues-and-prs',
	'context-budget',
];
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check' && args[0] !== '--write')) {
	throw new Error('Usage: bun scripts/sync-agent-instructions.mjs [--check|--write]');
}
const writing = args[0] === '--write';
const [guidance, claude, ...skills] = await Promise.all([
	readFile(resolve(root, 'AGENTS.md'), 'utf8'),
	readFile(resolve(root, 'CLAUDE.md'), 'utf8'),
	...skillNames.map((name) => readFile(resolve(root, `.claude/skills/${name}/SKILL.md`), 'utf8')),
]);
if (!/^@AGENTS\.md\s*$/m.test(claude)) {
	throw new Error('CLAUDE.md must import the canonical instructions with @AGENTS.md');
}

// 正本の検証がすべて終わるまで生成先を更新しない。
const generated = [
	{
		path: '.github/copilot-instructions.md',
		content: '<!-- AGENTS.md から生成。更新: bun run sync:agent-instructions -->\n\n' + guidance,
	},
	...skillNames.map((name, index) => {
		const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skills[index]);
		const metadata = frontmatter ? Bun.YAML.parse(frontmatter[1]) : null;
		if (metadata?.name !== name || typeof metadata.description !== 'string' || !metadata.description.trim()) {
			throw new Error(`Invalid name or description in .claude/skills/${name}/SKILL.md`);
		}
		return {
			path: `.agents/skills/${name}/SKILL.md`,
			content: `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(metadata.description)}\n---\n\n<!-- .claude/skills/ から生成。更新: bun run sync:agent-instructions -->\n\n# ${name}\n\n[作業別の正本](../../../.claude/skills/${name}/SKILL.md) を読んで適用する。共通の判断と保護条件は [AGENTS.md](../../../AGENTS.md) を参照する。本文の参照文書は、今回の変更に必要なものだけ読む。\n`,
		};
	}),
];

const changed = [];
for (const entry of generated) {
	const path = resolve(root, entry.path);
	let actual;
	try {
		actual = await readFile(path, 'utf8');
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	if (actual === entry.content) continue;
	changed.push(entry.path);
	if (writing) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, entry.content);
	}
}

if (changed.length > 0 && !writing) {
	console.error(
		`指示の生成先が正本と不一致:\n${changed.join('\n')}\nbun run sync:agent-instructions を実行してください。`,
	);
	process.exitCode = 1;
} else {
	console.log(
		writing ? `指示の生成先: ${changed.length} 件更新` : `指示の生成先: ${generated.length} 件一致、Claude の参照あり`,
	);
}
