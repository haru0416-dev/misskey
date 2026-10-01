/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 公式 upstream 相手の連合テストの結果 (vitest の JSON) を、既知の upstream 側の不具合一覧と照合する。
// テスト自体は弱めずに実行し、結果ファイルには失敗を残したまま、一覧と完全に一致するときだけ合格にする。

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const key = (file, name) => `${file} > ${name}`;

/** @returns {string[]} 一覧と一致しない理由。空なら合格。 */
export function compareWithKnownFailures(results, known) {
	const problems = [];
	if (!(results.numTotalTests > 0)) problems.push('no tests were executed');
	if (results.numPendingTests > 0 || results.numTodoTests > 0) {
		problems.push(`skipped or todo tests: ${results.numPendingTests} pending, ${results.numTodoTests} todo`);
	}

	const outcomes = new Map();
	for (const suite of results.testResults ?? []) {
		const file = basename(suite.name);
		const failedAssertions = suite.assertionResults.filter((a) => a.status === 'failed').length;
		// beforeAll やファイルの読み込みの失敗はテスト単位の失敗にならないため、別に数える。
		if (suite.status === 'failed' && failedAssertions === 0) problems.push(`${file}: suite failed outside tests`);
		for (const assertion of suite.assertionResults) {
			outcomes.set(key(file, assertion.fullName), assertion.status);
		}
	}

	const knownKeys = new Set(known.failures.map((f) => key(f.file, f.name)));
	for (const [name, status] of outcomes) {
		if (status === 'failed' && !knownKeys.has(name)) problems.push(`new failure: ${name}`);
	}
	for (const name of knownKeys) {
		const status = outcomes.get(name);
		if (status == null) problems.push(`known failure not found (renamed or removed): ${name}`);
		else if (status !== 'failed') problems.push(`known failure now ${status}; remove it from the list: ${name}`);
	}
	return problems;
}

if (import.meta.main) {
	const [resultsPath, knownPath] = process.argv.slice(2);
	if (resultsPath == null || knownPath == null) {
		console.error('Usage: bun scripts/check-federation-known-failures.mjs <results.json> <known-failures.json>');
		process.exit(2);
	}
	const results = JSON.parse(await readFile(resultsPath, 'utf8'));
	const known = JSON.parse(await readFile(knownPath, 'utf8'));
	const problems = compareWithKnownFailures(results, known);
	console.log(
		`${results.numPassedTests} passed, ${results.numFailedTests} failed (${known.failures.length} known upstream failures)`,
	);
	if (problems.length > 0) {
		for (const problem of problems) console.error(problem);
		process.exit(1);
	}
}
