/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { listRoleAssignmentsByUserIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/RoleStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role-policies.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiMeta, MiRole } from '@/models/_.js';
import type { RoleCondFormulaValue } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { memoizeInRequest } from '@/misc/request-scope.js';

export type HonoApiRolePolicyDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

function evaluateRoleCondition(user: MiUser, assignedRoles: MiRole[], value: RoleCondFormulaValue): boolean {
	try {
		switch (value.type) {
			case 'and':
				return value.values.every((v) => evaluateRoleCondition(user, assignedRoles, v));
			case 'or':
				return value.values.some((v) => evaluateRoleCondition(user, assignedRoles, v));
			case 'not':
				return !evaluateRoleCondition(user, assignedRoles, value.value);
			case 'roleAssignedTo':
				return assignedRoles.some((role) => role.id === value.roleId);
			case 'isLocal':
				return user.host == null;
			case 'isRemote':
				return user.host != null;
			case 'isSuspended':
				return user.isSuspended;
			case 'isLocked':
				return user.isLocked;
			case 'isBot':
				return user.isBot;
			case 'isCat':
				return user.isCat;
			case 'isExplorable':
				return user.isExplorable;
			case 'createdLessThan':
				return parseId(user.id).date.getTime() > Date.now() - value.sec * 1000;
			case 'createdMoreThan':
				return parseId(user.id).date.getTime() < Date.now() - value.sec * 1000;
			case 'followersLessThanOrEq':
				return user.followersCount <= value.value;
			case 'followersMoreThanOrEq':
				return user.followersCount >= value.value;
			case 'followingLessThanOrEq':
				return user.followingCount <= value.value;
			case 'followingMoreThanOrEq':
				return user.followingCount >= value.value;
			case 'notesLessThanOrEq':
				return user.notesCount <= value.value;
			case 'notesMoreThanOrEq':
				return user.notesCount >= value.value;
			default:
				return false;
		}
	} catch {
		return false;
	}
}

/**
 * 取得済みの role 全件 + そのユーザーの assignment 群からユーザーの保持ロールを計算する純粋部分。
 * ユーザー一覧のpackで assignments をIN句一括取得した上でユーザー毎に呼べるよう分離してある。
 */
export function computeHonoApiUserRoles(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser,
	roles: MiRole[],
	assignments: { roleId: MiRole['id']; expiresAt: Date | null }[],
): MiRole[] {
	const now = Date.now();
	const activeAssignedRoleIds = new Set(
		assignments
			.filter((assignment) => assignment.expiresAt == null || assignment.expiresAt.getTime() > now)
			.map((assignment) => assignment.roleId),
	);
	const assignedRoles = roles.filter((role) => activeAssignedRoleIds.has(role.id));

	return [
		...assignedRoles,
		...roles.filter(
			(role) => role.target === 'conditional' && evaluateRoleCondition(user, assignedRoles, role.condFormula),
		),
	];
}

export async function getHonoApiUserRoles(deps: HonoApiRolePolicyDependencies, user: MiUser | null): Promise<MiRole[]> {
	if (user == null) return [];

	// 同一リクエスト内で複数箇所から呼ばれる (notes/create と users/show でそれぞれ3回)。
	// ロール定義は全員で共通、割り当てはユーザーごとなので、キーを分けて memo する。
	const [roles, assignments] = await Promise.all([
		memoizeInRequest('role:all', () => listRolesFromDatabase(deps.db)),
		memoizeInRequest(`roleAssignment:${user.id}`, () => listRoleAssignmentsByUserIdFromDatabase(deps.db, user.id)),
	]);

	return computeHonoApiUserRoles(deps, user, roles, assignments);
}

/**
 * policies は jsonb で、role.policies も meta.policies も管理APIから任意の JSON を書き込めてしまう
 * (`admin/roles/update-default-policies` の paramDef は値を検証していない)。
 * 数値ポリシーに文字列や null が入ると `Math.max(...)` が NaN を返し、
 * 「上限0」でも「無制限」でもない壊れた制限値が全ユーザーへ適用されるため、
 * コード側の DEFAULT_POLICIES と形が一致しない値は採用しない。
 */
function isValidPolicyValue<T extends keyof RolePolicies>(name: T, value: unknown): value is RolePolicies[T] {
	const defaultValue = DEFAULT_POLICIES[name];
	if (Array.isArray(defaultValue)) return Array.isArray(value) && value.every((item) => typeof item === 'string');
	if (typeof defaultValue === 'number') return typeof value === 'number' && Number.isFinite(value);
	return typeof value === typeof defaultValue;
}

function aggregateChatAvailability(values: RolePolicies['chatAvailability'][]): RolePolicies['chatAvailability'] {
	if (values.includes('available')) return 'available';
	if (values.includes('readonly')) return 'readonly';
	return 'unavailable';
}

export async function getHonoApiRolePolicies(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser | null,
	precomputedRoles?: MiRole[],
): Promise<RolePolicies> {
	const basePolicies = { ...DEFAULT_POLICIES, ...deps.meta.policies };
	const roles = precomputedRoles ?? (await getHonoApiUserRoles(deps, user));

	function calc<T extends keyof RolePolicies>(
		name: T,
		aggregate: (values: RolePolicies[T][]) => RolePolicies[T],
	): RolePolicies[T] {
		// meta.policies 側も検証を通っていないので、インスタンス既定値も同様に形を確かめる
		const baseValue = isValidPolicyValue(name, basePolicies[name]) ? basePolicies[name] : DEFAULT_POLICIES[name];
		if (roles.length === 0) return aggregate([baseValue]);

		// policies は jsonb なので、壊れた形で保存された値が入っていることがある。
		// ここで例外を投げるとそのロールを持つユーザーの全APIが500になるため、既定値へフォールバックする。
		const policies = roles.map((role) => {
			const policy = role.policies[name] as unknown;
			return typeof policy === 'object' && policy !== null
				? (policy as { priority?: number; useDefault?: boolean; value?: unknown })
				: { priority: 0, useDefault: true };
		});
		const resolve = (policy: (typeof policies)[number]): RolePolicies[T] =>
			policy.useDefault || !isValidPolicyValue(name, policy.value) ? baseValue : policy.value;
		const p2 = policies.filter((policy) => policy.priority === 2);
		if (p2.length > 0) return aggregate(p2.map(resolve));

		const p1 = policies.filter((policy) => policy.priority === 1);
		if (p1.length > 0) return aggregate(p1.map(resolve));

		return aggregate(policies.map(resolve));
	}

	const serverMaxFileSizeMb = Math.floor(deps.config.limits.maximumFileSizeBytes / (1024 * 1024));

	return {
		gtlAvailable: calc('gtlAvailable', (values) => values.includes(true)),
		ltlAvailable: calc('ltlAvailable', (values) => values.includes(true)),
		canPublicNote: calc('canPublicNote', (values) => values.includes(true)),
		mentionLimit: calc('mentionLimit', (values) => Math.max(...values)),
		canInvite: calc('canInvite', (values) => values.includes(true)),
		inviteLimit: calc('inviteLimit', (values) => Math.max(...values)),
		inviteLimitCycle: calc('inviteLimitCycle', (values) => Math.max(...values)),
		inviteExpirationTime: calc('inviteExpirationTime', (values) => Math.max(...values)),
		canManageCustomEmojis: calc('canManageCustomEmojis', (values) => values.includes(true)),
		canManageAvatarDecorations: calc('canManageAvatarDecorations', (values) => values.includes(true)),
		canSearchNotes: calc('canSearchNotes', (values) => values.includes(true)),
		canSearchUsers: calc('canSearchUsers', (values) => values.includes(true)),
		canUseTranslator: calc('canUseTranslator', (values) => values.includes(true)),
		canHideAds: calc('canHideAds', (values) => values.includes(true)),
		canCreateChannel: calc('canCreateChannel', (values) => values.includes(true)),
		driveCapacityMb: calc('driveCapacityMb', (values) => Math.max(...values)),
		maxFileSizeMb: calc('maxFileSizeMb', (values) => Math.min(serverMaxFileSizeMb, Math.max(...values))),
		alwaysMarkNsfw: calc('alwaysMarkNsfw', (values) => values.includes(true)),
		canUpdateBioMedia: calc('canUpdateBioMedia', (values) => values.includes(true)),
		pinLimit: calc('pinLimit', (values) => Math.max(...values)),
		antennaLimit: calc('antennaLimit', (values) => Math.max(...values)),
		wordMuteLimit: calc('wordMuteLimit', (values) => Math.max(...values)),
		webhookLimit: calc('webhookLimit', (values) => Math.max(...values)),
		clipLimit: calc('clipLimit', (values) => Math.max(...values)),
		noteEachClipsLimit: calc('noteEachClipsLimit', (values) => Math.max(...values)),
		userListLimit: calc('userListLimit', (values) => Math.max(...values)),
		userEachUserListsLimit: calc('userEachUserListsLimit', (values) => Math.max(...values)),
		rateLimitFactor: calc('rateLimitFactor', (values) => Math.max(...values)),
		avatarDecorationLimit: calc('avatarDecorationLimit', (values) => Math.max(...values)),
		canImportAntennas: calc('canImportAntennas', (values) => values.includes(true)),
		canImportBlocking: calc('canImportBlocking', (values) => values.includes(true)),
		canImportFollowing: calc('canImportFollowing', (values) => values.includes(true)),
		canImportMuting: calc('canImportMuting', (values) => values.includes(true)),
		canImportUserLists: calc('canImportUserLists', (values) => values.includes(true)),
		chatAvailability: calc('chatAvailability', aggregateChatAvailability),
		uploadableFileTypes: calc('uploadableFileTypes', (values) => {
			const set = new Set<string>();
			for (const value of values) {
				for (const type of value) {
					if (type.trim() === '') continue;
					set.add(type.trim());
				}
			}
			return [...set];
		}),
		noteDraftLimit: calc('noteDraftLimit', (values) => Math.max(...values)),
		scheduledNoteLimit: calc('scheduledNoteLimit', (values) => Math.max(...values)),
		watermarkAvailable: calc('watermarkAvailable', (values) => values.includes(true)),
	};
}

export async function isHonoApiModerator(deps: HonoApiRolePolicyDependencies, user: MiUser | null): Promise<boolean> {
	if (user == null) return false;
	if (deps.meta.rootUserId === user.id) return true;

	const roles = await getHonoApiUserRoles(deps, user);
	return roles.some((role) => role.isModerator || role.isAdministrator);
}

export async function isHonoApiAdministrator(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser | null,
): Promise<boolean> {
	if (user == null) return false;
	if (deps.meta.rootUserId === user.id) return true;

	const roles = await getHonoApiUserRoles(deps, user);
	return roles.some((role) => role.isAdministrator);
}

/** root ユーザーは requiredRolePolicy の値にかかわらず許可する。 */
export async function hasHonoApiRolePolicyOrIsRoot(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser,
	policy: keyof RolePolicies,
): Promise<boolean> {
	if (deps.meta.rootUserId === user.id) return true;
	return !!(await getHonoApiRolePolicies(deps, user))[policy];
}
