/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import policy from '../../scripts/optimization/preregistration.json' with { type: 'json' };
import {
	acceptedRecoveryListingFailure,
	type CorrectnessCheck,
	type Peer,
	type RecoveryListingEvidence,
	type RecoverySnapshot,
} from '../../scripts/optimization/scenarios.mjs';

const peer: Peer = { url: 'https://b.test', kind: 'upstream', adminTokenEnv: 'UNUSED' };
type OmissionCheck = CorrectnessCheck & {
	evidence: RecoveryListingEvidence & { timelineCache: NonNullable<RecoverySnapshot['timelineCache']> };
};

function omission(): OmissionCheck {
	const expected = Array.from({ length: 9 }, (_, index) => ({
		uri: `https://a.test/notes/local${index + 1}`,
		text: `note-${index + 1}`,
		visibility: index === 3 ? 'followers' : 'public',
	}));
	const stored = expected.map((note, index) => ({
		...note,
		id: `remote0${index + 1}`,
		userId: 'author',
		localOnly: false,
	}));
	const direct = stored.map((note) => ({
		id: note.id,
		uri: note.uri,
		text: note.text,
		visibility: note.visibility,
		userId: note.userId,
	}));
	return {
		name: 'upstream-recovery-listing',
		passed: false,
		evidence: {
			kind: 'upstream-user-timeline-cache',
			peer: { url: peer.url, ...policy.knownUpstreamFailure.peer, kind: 'upstream' },
			authorId: 'author',
			viewerId: 'viewer',
			expected,
			stored,
			direct,
			listed: [direct[8]!, direct[0]!],
			timelineCache: { key: 'b.test:list:userTimeline:author', ttlMs: -1, ids: ['remote01', 'remote09'] },
			deadlineExpired: true,
		},
	};
}

function rejectMutation(change: (check: OmissionCheck) => void) {
	const check = omission();
	change(check);
	expect(acceptedRecoveryListingFailure(check, peer)).toBeUndefined();
}

describe('approved upstream recovery listing omission', () => {
	test('recognizes seven cache-interior omissions without changing the raw failure', () => {
		const check = omission();
		const original = structuredClone(check);
		expect(acceptedRecoveryListingFailure(check, peer)).toEqual({
			missingIds: ['remote08', 'remote07', 'remote06', 'remote05', 'remote04', 'remote03', 'remote02'],
		});
		expect(check).toEqual(original);
	});

	test('recognizes cache-interior and newer omissions together without changing the raw failure', () => {
		const check = omission();
		check.evidence.listed = [check.evidence.direct[4]!, check.evidence.direct[0]!];
		check.evidence.timelineCache.ids = ['remote01', 'remote05'];
		const original = structuredClone(check);
		expect(acceptedRecoveryListingFailure(check, peer)).toEqual({
			missingIds: ['remote09', 'remote08', 'remote07', 'remote06', 'remote04', 'remote03', 'remote02'],
		});
		expect(check).toEqual(original);
	});

	test('does not exempt missing, duplicate or leaked receiver storage', () => {
		rejectMutation(({ evidence }) => {
			evidence.stored.pop();
		});
		rejectMutation(({ evidence }) => {
			evidence.stored[1] = { ...evidence.stored[0]! };
		});
		rejectMutation(({ evidence }) => {
			evidence.expected[1] = { ...evidence.expected[0]! };
		});
		rejectMutation(({ evidence }) => {
			evidence.stored.push({ ...evidence.stored[0]!, id: 'extra', uri: 'https://a.test/notes/extra' });
		});
		rejectMutation(({ evidence }) => {
			evidence.stored[0]!.localOnly = true;
		});
		rejectMutation(({ evidence }) => {
			evidence.stored[0]!.visibility = 'specified';
		});
	});

	test('requires complete direct reads with unchanged identity, content and visibility', () => {
		rejectMutation(({ evidence }) => {
			evidence.direct.pop();
		});
		rejectMutation(({ evidence }) => {
			evidence.direct[1] = { ...evidence.direct[0]! };
		});
		rejectMutation(({ evidence }) => {
			evidence.direct[3]!.visibility = 'public';
		});
		rejectMutation(({ evidence }) => {
			evidence.direct[3]!.text = 'changed';
		});
		rejectMutation(({ evidence }) => {
			evidence.direct[3]!.userId = 'anotherauthor';
		});
	});

	test('rejects duplicate, extra, misordered and content-altered listings', () => {
		rejectMutation(({ evidence }) => {
			evidence.listed.push({ ...evidence.listed[0]! });
		});
		rejectMutation(({ evidence }) => {
			evidence.listed[1] = { ...evidence.listed[1]!, id: 'extra' };
		});
		rejectMutation(({ evidence }) => {
			evidence.listed.reverse();
		});
		rejectMutation(({ evidence }) => {
			evidence.listed[0] = { ...evidence.listed[0]!, text: 'changed' };
		});
	});

	test('restricts recognition to the configured fixed upstream and this failed check', () => {
		const check = omission();
		expect(acceptedRecoveryListingFailure(check, { ...peer, url: 'https://other.test' })).toBeUndefined();
		expect(acceptedRecoveryListingFailure(check, { ...peer, kind: 'fork' })).toBeUndefined();
		rejectMutation((value) => {
			value.name = 'load-shutdown-restart-no-loss';
		});
		rejectMutation((value) => {
			value.passed = true;
		});
		rejectMutation(({ evidence }) => {
			evidence.peer.version = '2026.9.1';
		});
		rejectMutation(({ evidence }) => {
			evidence.peer.commit = 'anothercommit';
		});
		rejectMutation(({ evidence }) => {
			evidence.peer.image = 'anotherimage';
		});
	});

	test('requires an expired deadline and persistent cache gaps newer than its oldest ID', () => {
		rejectMutation(({ evidence }) => {
			evidence.deadlineExpired = false;
		});
		rejectMutation(({ evidence }) => {
			evidence.timelineCache.ttlMs = 1000;
		});
		rejectMutation(({ evidence }) => {
			evidence.timelineCache.key = 'b.test:list:userTimeline:otherauthor';
		});
		rejectMutation(({ evidence }) => {
			evidence.timelineCache.ids.push('remote04');
		});
		rejectMutation(({ evidence }) => {
			evidence.timelineCache.ids = ['remote03', 'remote09'];
			evidence.listed = [evidence.direct[8]!, evidence.direct[2]!];
		});
		rejectMutation(({ evidence }) => {
			evidence.timelineCache.ids.push('remote01');
		});
		const malformed: CorrectnessCheck = {
			...omission(),
			evidence: { kind: 'upstream-user-timeline-cache', deadlineExpired: true },
		};
		expect(acceptedRecoveryListingFailure(malformed, peer)).toBeUndefined();
	});
});
