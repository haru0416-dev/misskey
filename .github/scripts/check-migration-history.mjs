/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const protectedMigration = /^packages\/backend\/migration\/(?:_legacy\/|\d+[^/]*\.sql$|meta\/[^/]+_snapshot\.json$)/;

const journalPath = 'packages/backend/migration/meta/_journal.json';

export function findProtectedMigrationChanges(nameStatus) {
	return nameStatus
		.split('\n')
		.filter(Boolean)
		.map((line) => line.split('\t'))
		.filter(([status, path]) => /^[MDR]/.test(status) && protectedMigration.test(path))
		.map((parts) => parts.join('\t'));
}

export function isJournalAppendOnly(baseJournal, currentJournal) {
	const baseMetadata = { ...baseJournal, entries: undefined };
	const currentMetadata = { ...currentJournal, entries: undefined };
	if (JSON.stringify(baseMetadata) !== JSON.stringify(currentMetadata)) return false;
	const baseEntries = baseJournal.entries ?? [];
	const currentEntries = currentJournal.entries ?? [];
	if (currentEntries.length < baseEntries.length) return false;
	return baseEntries.every((entry, index) => JSON.stringify(entry) === JSON.stringify(currentEntries[index]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const base = process.argv[2];
	if (!base) throw new Error('Usage: check-migration-history.mjs <base-commit>');

	const diff = execFileSync(
		'git',
		['diff', '--name-status', '--diff-filter=MDR', `${base}...HEAD`, '--', 'packages/backend/migration'],
		{ encoding: 'utf8' },
	);
	const violations = findProtectedMigrationChanges(diff);
	const journalStatus = diff
		.split('\n')
		.filter(Boolean)
		.map((line) => line.split('\t'))
		.find(([, path]) => path === journalPath);
	if (journalStatus != null) {
		const [status] = journalStatus;
		if (status !== 'M') {
			violations.push(journalStatus.join('\t'));
		} else {
			const baseJournal = JSON.parse(execFileSync('git', ['show', `${base}:${journalPath}`], { encoding: 'utf8' }));
			const currentJournal = JSON.parse(execFileSync('git', ['show', `HEAD:${journalPath}`], { encoding: 'utf8' }));
			if (!isJournalAppendOnly(baseJournal, currentJournal)) violations.push(journalStatus.join('\t'));
		}
	}

	if (violations.length > 0) {
		console.error('Existing migration history must not be modified or deleted:');
		console.error(violations.join('\n'));
		process.exitCode = 1;
	}
}
