/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { findProtectedMigrationChanges, isJournalAppendOnly } from './check-migration-history.mjs';

test('rejects changes and deletions to existing migration history', () => {
	const diff = [
		'M\tpackages/backend/migration/0001_example.sql',
		'D\tpackages/backend/migration/meta/0001_snapshot.json',
		'R100\tpackages/backend/migration/0002_old.sql\tpackages/backend/migration/0002_renamed.sql',
	].join('\n');

	assert.deepEqual(findProtectedMigrationChanges(diff), diff.split('\n'));
});

test('allows appending journal entries without changing history', () => {
	const first = { idx: 0, when: 1, tag: '0000_initial', breakpoints: true };
	const second = { idx: 1, when: 2, tag: '0001_next', breakpoints: true };
	const metadata = { version: '7', dialect: 'postgresql' };
	assert.equal(isJournalAppendOnly({ ...metadata, entries: [first] }, { ...metadata, entries: [first, second] }), true);
	assert.equal(
		isJournalAppendOnly(
			{ ...metadata, entries: [first] },
			{ ...metadata, entries: [{ ...first, tag: 'changed' }, second] },
		),
		false,
	);
	assert.equal(
		isJournalAppendOnly({ ...metadata, entries: [first, second] }, { ...metadata, entries: [first] }),
		false,
	);
	assert.equal(
		isJournalAppendOnly({ ...metadata, entries: [first] }, { ...metadata, version: '8', entries: [first, second] }),
		false,
	);
});

test('allows new migrations and protects legacy files', () => {
	const diff = [
		'A\tpackages/backend/migration/0002_new.sql',
		'A\tpackages/backend/migration/meta/0002_snapshot.json',
		'M\tpackages/backend/migration/_legacy/old.js',
	].join('\n');

	assert.deepEqual(findProtectedMigrationChanges(diff), ['M\tpackages/backend/migration/_legacy/old.js']);
});
