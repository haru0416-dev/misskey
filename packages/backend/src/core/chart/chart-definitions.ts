/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { name as activeUsersChartName, schema as activeUsersChartSchema } from '@/core/chart/entities/active-users.js';
import { name as apRequestChartName, schema as apRequestChartSchema } from '@/core/chart/entities/ap-request.js';
import { name as driveChartName, schema as driveChartSchema } from '@/core/chart/entities/drive.js';
import { name as federationChartName, schema as federationChartSchema } from '@/core/chart/entities/federation.js';
import { name as instanceChartName, schema as instanceChartSchema } from '@/core/chart/entities/instance.js';
import { name as notesChartName, schema as notesChartSchema } from '@/core/chart/entities/notes.js';
import {
	name as perUserDriveChartName,
	schema as perUserDriveChartSchema,
} from '@/core/chart/entities/per-user-drive.js';
import {
	name as perUserFollowingChartName,
	schema as perUserFollowingChartSchema,
} from '@/core/chart/entities/per-user-following.js';
import {
	name as perUserNotesChartName,
	schema as perUserNotesChartSchema,
} from '@/core/chart/entities/per-user-notes.js';
import { name as perUserPvChartName, schema as perUserPvChartSchema } from '@/core/chart/entities/per-user-pv.js';
import {
	name as perUserReactionsChartName,
	schema as perUserReactionsChartSchema,
} from '@/core/chart/entities/per-user-reactions.js';
import { name as usersChartName, schema as usersChartSchema } from '@/core/chart/entities/users.js';

// grouped は保存時のテーブル形状を決めるため、書き込み側 (chart-runtime.ts) と
// 読み取り側 (rest/chart/charts.ts) が同じ値を使うようここだけで定義する。
export const chartDefinitions = {
	activeUsers: { name: activeUsersChartName, schema: activeUsersChartSchema, grouped: false },
	apRequest: { name: apRequestChartName, schema: apRequestChartSchema, grouped: false },
	drive: { name: driveChartName, schema: driveChartSchema, grouped: false },
	federation: { name: federationChartName, schema: federationChartSchema, grouped: false },
	instance: { name: instanceChartName, schema: instanceChartSchema, grouped: true },
	notes: { name: notesChartName, schema: notesChartSchema, grouped: false },
	perUserDrive: { name: perUserDriveChartName, schema: perUserDriveChartSchema, grouped: true },
	perUserFollowing: { name: perUserFollowingChartName, schema: perUserFollowingChartSchema, grouped: true },
	perUserNotes: { name: perUserNotesChartName, schema: perUserNotesChartSchema, grouped: true },
	perUserPv: { name: perUserPvChartName, schema: perUserPvChartSchema, grouped: true },
	perUserReactions: { name: perUserReactionsChartName, schema: perUserReactionsChartSchema, grouped: true },
	users: { name: usersChartName, schema: usersChartSchema, grouped: false },
} as const;
