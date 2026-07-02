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

export type HonoApiRolePolicyDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

function evaluateRoleCondition(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser,
	assignedRoles: MiRole[],
	value: RoleCondFormulaValue,
): boolean {
	try {
		switch (value.type) {
			case 'and':
				return value.values.every(v => evaluateRoleCondition(deps, user, assignedRoles, v));
			case 'or':
				return value.values.some(v => evaluateRoleCondition(deps, user, assignedRoles, v));
			case 'not':
				return !evaluateRoleCondition(deps, user, assignedRoles, value.value);
			case 'roleAssignedTo':
				return assignedRoles.some(role => role.id === value.roleId);
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
				return parseId(deps.config, user.id).date.getTime() > Date.now() - (value.sec * 1000);
			case 'createdMoreThan':
				return parseId(deps.config, user.id).date.getTime() < Date.now() - (value.sec * 1000);
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

export async function getHonoApiUserRoles(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser | null,
): Promise<MiRole[]> {
	if (user == null) return [];

	const [roles, assignments] = await Promise.all([
		listRolesFromDatabase(deps.db),
		listRoleAssignmentsByUserIdFromDatabase(deps.db, user.id),
	]);
	const now = Date.now();
	const activeAssignedRoleIds = new Set(assignments
		.filter(assignment => assignment.expiresAt == null || assignment.expiresAt.getTime() > now)
		.map(assignment => assignment.roleId));
	const assignedRoles = roles.filter(role => activeAssignedRoleIds.has(role.id));

	return [
		...assignedRoles,
		...roles.filter(role =>
			role.target === 'conditional' &&
			evaluateRoleCondition(deps, user, assignedRoles, role.condFormula)),
	];
}

function aggregateChatAvailability(values: RolePolicies['chatAvailability'][]): RolePolicies['chatAvailability'] {
	if (values.some(value => value === 'available')) return 'available';
	if (values.some(value => value === 'readonly')) return 'readonly';
	return 'unavailable';
}

export async function getHonoApiRolePolicies(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser | null,
): Promise<RolePolicies> {
	const basePolicies = { ...DEFAULT_POLICIES, ...deps.meta.policies };
	const roles = await getHonoApiUserRoles(deps, user);

	function calc<T extends keyof RolePolicies>(name: T, aggregate: (values: RolePolicies[T][]) => RolePolicies[T]): RolePolicies[T] {
		if (roles.length === 0) return aggregate([basePolicies[name]]);

		const policies = roles.map(role => role.policies[name] ?? { priority: 0, useDefault: true });
		const p2 = policies.filter(policy => policy.priority === 2);
		if (p2.length > 0) return aggregate(p2.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

		const p1 = policies.filter(policy => policy.priority === 1);
		if (p1.length > 0) return aggregate(p1.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

		return aggregate(policies.map(policy => policy.useDefault ? basePolicies[name] : policy.value));
	}

	const serverMaxFileSizeMb = Math.floor(deps.config.maxFileSize / (1024 * 1024));

	return {
		gtlAvailable: calc('gtlAvailable', values => values.some(value => value === true)),
		ltlAvailable: calc('ltlAvailable', values => values.some(value => value === true)),
		canPublicNote: calc('canPublicNote', values => values.some(value => value === true)),
		mentionLimit: calc('mentionLimit', values => Math.max(...values)),
		canInvite: calc('canInvite', values => values.some(value => value === true)),
		inviteLimit: calc('inviteLimit', values => Math.max(...values)),
		inviteLimitCycle: calc('inviteLimitCycle', values => Math.max(...values)),
		inviteExpirationTime: calc('inviteExpirationTime', values => Math.max(...values)),
		canManageCustomEmojis: calc('canManageCustomEmojis', values => values.some(value => value === true)),
		canManageAvatarDecorations: calc('canManageAvatarDecorations', values => values.some(value => value === true)),
		canSearchNotes: calc('canSearchNotes', values => values.some(value => value === true)),
		canSearchUsers: calc('canSearchUsers', values => values.some(value => value === true)),
		canUseTranslator: calc('canUseTranslator', values => values.some(value => value === true)),
		canHideAds: calc('canHideAds', values => values.some(value => value === true)),
		canCreateChannel: calc('canCreateChannel', values => values.some(value => value === true)),
		driveCapacityMb: calc('driveCapacityMb', values => Math.max(...values)),
		maxFileSizeMb: calc('maxFileSizeMb', values => Math.min(serverMaxFileSizeMb, Math.max(...values))),
		alwaysMarkNsfw: calc('alwaysMarkNsfw', values => values.some(value => value === true)),
		canUpdateBioMedia: calc('canUpdateBioMedia', values => values.some(value => value === true)),
		pinLimit: calc('pinLimit', values => Math.max(...values)),
		antennaLimit: calc('antennaLimit', values => Math.max(...values)),
		wordMuteLimit: calc('wordMuteLimit', values => Math.max(...values)),
		webhookLimit: calc('webhookLimit', values => Math.max(...values)),
		clipLimit: calc('clipLimit', values => Math.max(...values)),
		noteEachClipsLimit: calc('noteEachClipsLimit', values => Math.max(...values)),
		userListLimit: calc('userListLimit', values => Math.max(...values)),
		userEachUserListsLimit: calc('userEachUserListsLimit', values => Math.max(...values)),
		rateLimitFactor: calc('rateLimitFactor', values => Math.max(...values)),
		avatarDecorationLimit: calc('avatarDecorationLimit', values => Math.max(...values)),
		canImportAntennas: calc('canImportAntennas', values => values.some(value => value === true)),
		canImportBlocking: calc('canImportBlocking', values => values.some(value => value === true)),
		canImportFollowing: calc('canImportFollowing', values => values.some(value => value === true)),
		canImportMuting: calc('canImportMuting', values => values.some(value => value === true)),
		canImportUserLists: calc('canImportUserLists', values => values.some(value => value === true)),
		chatAvailability: calc('chatAvailability', aggregateChatAvailability),
		uploadableFileTypes: calc('uploadableFileTypes', values => {
			const set = new Set<string>();
			for (const value of values) {
				for (const type of value) {
					if (type.trim() === '') continue;
					set.add(type.trim());
				}
			}
			return [...set];
		}),
		noteDraftLimit: calc('noteDraftLimit', values => Math.max(...values)),
		scheduledNoteLimit: calc('scheduledNoteLimit', values => Math.max(...values)),
		watermarkAvailable: calc('watermarkAvailable', values => values.some(value => value === true)),
	};
}

export async function isHonoApiModerator(
	deps: HonoApiRolePolicyDependencies,
	user: MiUser | null,
): Promise<boolean> {
	if (user == null) return false;
	if (deps.meta.rootUserId === user.id) return true;

	const roles = await getHonoApiUserRoles(deps, user);
	return roles.some(role => role.isModerator || role.isAdministrator);
}
