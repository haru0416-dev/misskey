/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { claimAchievement, claimedAchievements } from '@/features/achievements/achievements.js';
import { isBirthday } from '@/features/users/is-birthday.js';
import { $i } from '@/i.js';

export function initializeAchievements(): void {
	const account = $i;
	if (account == null) return;

	const now = new Date();
	const m = now.getMonth() + 1;
	const d = now.getDate();

	if (isBirthday(account, now)) {
		void claimAchievement('loggedInOnBirthday');
	}

	if (m === 1 && d === 1) {
		void claimAchievement('loggedInOnNewYearsDay');
	}

	if (account.loggedInDays >= 3) void claimAchievement('login3');
	if (account.loggedInDays >= 7) void claimAchievement('login7');
	if (account.loggedInDays >= 15) void claimAchievement('login15');
	if (account.loggedInDays >= 30) void claimAchievement('login30');
	if (account.loggedInDays >= 60) void claimAchievement('login60');
	if (account.loggedInDays >= 100) void claimAchievement('login100');
	if (account.loggedInDays >= 200) void claimAchievement('login200');
	if (account.loggedInDays >= 300) void claimAchievement('login300');
	if (account.loggedInDays >= 400) void claimAchievement('login400');
	if (account.loggedInDays >= 500) void claimAchievement('login500');
	if (account.loggedInDays >= 600) void claimAchievement('login600');
	if (account.loggedInDays >= 700) void claimAchievement('login700');
	if (account.loggedInDays >= 800) void claimAchievement('login800');
	if (account.loggedInDays >= 900) void claimAchievement('login900');
	if (account.loggedInDays >= 1000) void claimAchievement('login1000');

	if (account.notesCount > 0) void claimAchievement('notes1');
	if (account.notesCount >= 10) void claimAchievement('notes10');
	if (account.notesCount >= 100) void claimAchievement('notes100');
	if (account.notesCount >= 500) void claimAchievement('notes500');
	if (account.notesCount >= 1000) void claimAchievement('notes1000');
	if (account.notesCount >= 5000) void claimAchievement('notes5000');
	if (account.notesCount >= 10000) void claimAchievement('notes10000');
	if (account.notesCount >= 20000) void claimAchievement('notes20000');
	if (account.notesCount >= 30000) void claimAchievement('notes30000');
	if (account.notesCount >= 40000) void claimAchievement('notes40000');
	if (account.notesCount >= 50000) void claimAchievement('notes50000');
	if (account.notesCount >= 60000) void claimAchievement('notes60000');
	if (account.notesCount >= 70000) void claimAchievement('notes70000');
	if (account.notesCount >= 80000) void claimAchievement('notes80000');
	if (account.notesCount >= 90000) void claimAchievement('notes90000');
	if (account.notesCount >= 100000) void claimAchievement('notes100000');

	if (account.followersCount > 0) void claimAchievement('followers1');
	if (account.followersCount >= 10) void claimAchievement('followers10');
	if (account.followersCount >= 50) void claimAchievement('followers50');
	if (account.followersCount >= 100) void claimAchievement('followers100');
	if (account.followersCount >= 300) void claimAchievement('followers300');
	if (account.followersCount >= 500) void claimAchievement('followers500');
	if (account.followersCount >= 1000) void claimAchievement('followers1000');

	const createdAtThreeYearsLater = new Date(account.createdAt);
	createdAtThreeYearsLater.setFullYear(createdAtThreeYearsLater.getFullYear() + 3);
	if (now >= createdAtThreeYearsLater) {
		void claimAchievement('passedSinceAccountCreated3');
		void claimAchievement('passedSinceAccountCreated2');
		void claimAchievement('passedSinceAccountCreated1');
	} else {
		const createdAtTwoYearsLater = new Date(account.createdAt);
		createdAtTwoYearsLater.setFullYear(createdAtTwoYearsLater.getFullYear() + 2);
		if (now >= createdAtTwoYearsLater) {
			void claimAchievement('passedSinceAccountCreated2');
			void claimAchievement('passedSinceAccountCreated1');
		} else {
			const createdAtOneYearLater = new Date(account.createdAt);
			createdAtOneYearLater.setFullYear(createdAtOneYearLater.getFullYear() + 1);
			if (now >= createdAtOneYearLater) {
				void claimAchievement('passedSinceAccountCreated1');
			}
		}
	}

	if (claimedAchievements.length >= 30) {
		void claimAchievement('collectAchievements30');
	}

	if (!claimedAchievements.includes('justPlainLucky')) {
		let justPlainLuckyTimer: number | null = null;
		let lastVisibilityChangedAt = Date.now();

		function claimPlainLucky() {
			if (window.document.visibilityState !== 'visible') {
				if (justPlainLuckyTimer != null) window.clearTimeout(justPlainLuckyTimer);
				return;
			}

			if (Math.floor(Math.random() * 20000) === 0) {
				void claimAchievement('justPlainLucky');
			} else {
				justPlainLuckyTimer = window.setTimeout(claimPlainLucky, 1000 * 10);
			}
		}

		window.addEventListener(
			'visibilitychange',
			() => {
				const changedAt = Date.now();

				if (window.document.visibilityState === 'visible') {
					// タブを高速で切り替えたら取得処理が何度も走るのを防ぐ
					if (changedAt - lastVisibilityChangedAt < 1000 * 10) {
						justPlainLuckyTimer = window.setTimeout(claimPlainLucky, 1000 * 10);
					} else {
						claimPlainLucky();
					}
				} else if (justPlainLuckyTimer != null) {
					window.clearTimeout(justPlainLuckyTimer);
					justPlainLuckyTimer = null;
				}

				lastVisibilityChangedAt = changedAt;
			},
			{ passive: true },
		);

		claimPlainLucky();
	}

	if (!claimedAchievements.includes('client30min')) {
		window.setTimeout(() => {
			void claimAchievement('client30min');
		}, 1000 * 60 * 30);
	}

	if (!claimedAchievements.includes('client60min')) {
		window.setTimeout(() => {
			void claimAchievement('client60min');
		}, 1000 * 60 * 60);
	}
}
