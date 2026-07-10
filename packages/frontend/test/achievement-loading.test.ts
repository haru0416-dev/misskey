/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const { claimAchievementMock } = vi.hoisted(() => ({
	claimAchievementMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/utility/achievements.js', () => ({
	claimedAchievements: ['justPlainLucky', 'client30min', 'client60min'],
	claimAchievement: claimAchievementMock,
}));

vi.mock('@/utility/is-birthday.js', () => ({
	isBirthday: () => false,
}));

vi.mock('@/i.js', () => ({
	$i: {
		createdAt: '2025-01-01T00:00:00.000Z',
		loggedInDays: 30,
		notesCount: 500,
		followersCount: 50,
	},
}));

describe('achievement loading', () => {
	beforeEach(() => {
		claimAchievementMock.mockClear();
	});

	test('loads the achievement implementation when a claim is requested', async () => {
		const { claimAchievement } = await import('@/utility/claim-achievement.js');

		await claimAchievement('notes1');

		expect(claimAchievementMock).toHaveBeenCalledOnce();
		expect(claimAchievementMock).toHaveBeenCalledWith('notes1');
	});

	test('runs startup achievement checks from the deferred initializer', async () => {
		const { initializeAchievements } = await import('@/utility/initialize-achievements.js');

		initializeAchievements();

		expect(claimAchievementMock).toHaveBeenCalledWith('login3');
		expect(claimAchievementMock).toHaveBeenCalledWith('login30');
		expect(claimAchievementMock).toHaveBeenCalledWith('notes500');
		expect(claimAchievementMock).toHaveBeenCalledWith('followers50');
	});
});
