/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { expect, test } from 'bun:test';
import { compareWithKnownFailures } from './check-federation-known-failures.mjs';

const known = JSON.parse(
	await readFile(new URL('../packages/backend/test-federation/known-upstream-failures.json', import.meta.url), 'utf8'),
);

/** 既知の失敗をすべて失敗させ、passing の件数だけ通ったテストを足した結果。 */
function results({ passing = 3, failed = known.failures, extraSuite } = {}) {
	const byFile = new Map();
	for (const f of failed) byFile.set(f.file, [...(byFile.get(f.file) ?? []), { fullName: f.name, status: 'failed' }]);
	const passed = Array.from({ length: passing }, (_, i) => ({ fullName: `ok ${i}`, status: 'passed' }));
	const testResults = [
		{ name: '/misskey/packages/backend/test-federation/test/note.test.ts', status: 'passed', assertionResults: passed },
		...[...byFile].map(([file, assertionResults]) => ({
			name: `/misskey/packages/backend/test-federation/test/${file}`,
			status: 'failed',
			assertionResults,
		})),
		...(extraSuite ? [extraSuite] : []),
	];
	const all = testResults.flatMap((s) => s.assertionResults);
	return {
		numTotalTests: all.length,
		numPassedTests: all.filter((a) => a.status === 'passed').length,
		numFailedTests: all.filter((a) => a.status === 'failed').length,
		numPendingTests: 0,
		numTodoTests: 0,
		testResults,
	};
}

test('既知の失敗だけなら合格', () => {
	expect(compareWithKnownFailures(results(), known)).toEqual([]);
});

test('一覧にない失敗があれば不合格', () => {
	const r = results();
	r.testResults[0].assertionResults.push({ fullName: 'Note delivery', status: 'failed' });
	expect(compareWithKnownFailures(r, known)).toEqual(['new failure: note.test.ts > Note delivery']);
});

test('既知の失敗が通るようになったら、一覧を直すよう不合格にする', () => {
	const [fixed, ...rest] = known.failures;
	const r = results({ failed: rest });
	r.testResults[0].assertionResults.push({ fullName: fixed.name, status: 'passed' });
	r.testResults[0].name = `/x/${fixed.file}`;
	expect(compareWithKnownFailures(r, known)).toEqual([
		`known failure now passed; remove it from the list: ${fixed.file} > ${fixed.name}`,
	]);
});

test('既知の失敗が見当たらない・skip がある・テスト外でスイートが落ちたときは不合格', () => {
	const [, ...rest] = known.failures;
	expect(compareWithKnownFailures(results({ failed: rest }), known)[0]).toMatch(/^known failure not found/);
	expect(compareWithKnownFailures({ ...results(), numPendingTests: 1 }, known)[0]).toMatch(/^skipped or todo/);
	const crashed = results({
		extraSuite: { name: '/x/resilience.test.ts', status: 'failed', assertionResults: [] },
	});
	expect(compareWithKnownFailures(crashed, known)).toEqual(['resilience.test.ts: suite failed outside tests']);
	expect(compareWithKnownFailures({ ...results({ passing: 0, failed: [] }), testResults: [] }, known)).toContain(
		'no tests were executed',
	);
});
