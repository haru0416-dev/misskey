/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	listRoleAssignmentsByRoleIdsFromDatabase,
	listRoleAssignmentsByUserIdFromDatabase,
	listRoleAssignmentsByUserIdsFromDatabase,
} from '@/core/role/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import { listSigninsByUserIdFromDatabase } from '@/core/account/SigninStore.js';
import {
	fetchUserProfileByUserIdFromDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	listUserProfilesByUserIdsFromDatabase,
} from '@/core/user/UserProfileStore.js';
import {
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	listAdminUsersFromDatabase,
	listUsersByIdsFromDatabase,
} from '@/core/user/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { parseId } from '@/misc/id/parse-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta, MiRole } from '@/models/_.js';
import type { MiRoleAssignment } from '@/models/RoleAssignment.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import {
	computeApiUserRoles,
	getApiRolePolicies,
	getApiUserRoles,
	isApiAdministrator,
	isApiModerator,
} from '../role/role-policy.js';
import { packApiRoles } from '../role/roles.js';
import { packApiSignin } from '../account/i.js';
import {
	packUserDetailedNotMeManyForApi,
	type UserDetailedNotMeApiResponse,
	type UserPackingDependencies,
} from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminUsersDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

type AdminShowUserResponse = {
	email: string | null;
	emailVerified: boolean;
	followedMessage: string | null;
	autoAcceptFollowed: boolean;
	noCrawle: boolean;
	preventAiLearning: boolean;
	alwaysMarkNsfw: boolean;
	autoSensitive: boolean;
	carefulBot: boolean;
	injectFeaturedNote: boolean;
	receiveAnnouncementEmail: boolean;
	mutedWords: (string | string[])[];
	mutedInstances: string[];
	notificationRecieveConfig: Record<string, unknown>;
	isModerator: boolean;
	isSilenced: boolean;
	isSuspended: boolean;
	isHibernated: boolean;
	lastActiveDate: string | null;
	moderationNote: string;
	signins: ReturnType<typeof packApiSignin>[];
	policies: Awaited<ReturnType<typeof getApiRolePolicies>>;
	roles: Packed<'Role'>[];
	roleAssigns: {
		createdAt: string;
		expiresAt: string | null;
		roleId: string;
	}[];
};

export const adminShowUserParamDef = z.object({
	userId: misskeyId(),
});

export const adminShowUsersParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	offset: z.number().int().optional().default(0),
	sort: z
		.enum([
			'+follower',
			'-follower',
			'+createdAt',
			'-createdAt',
			'+updatedAt',
			'-updatedAt',
			'+lastActiveDate',
			'-lastActiveDate',
		])
		.optional(),
	state: z
		.enum(['all', 'alive', 'available', 'admin', 'moderator', 'adminOrModerator', 'suspended'])
		.optional()
		.default('all'),
	origin: z.enum(['combined', 'local', 'remote']).optional().default('combined'),
	username: z.string().nullable().optional().default(null),
	/** ローカルホストは null で表す。 */
	hostname: z.string().nullable().optional().default(null),
});

function isActiveRoleAssignment(assign: MiRoleAssignment): boolean {
	return assign.expiresAt == null || assign.expiresAt.getTime() > Date.now();
}

async function getAdministratorIds(deps: ApiAdminUsersDependencies): Promise<MiUser['id'][]> {
	const roles = await listRolesFromDatabase(deps.db);
	const administratorRoles = roles.filter((role) => role.isAdministrator);
	const assigns =
		administratorRoles.length > 0
			? await listRoleAssignmentsByRoleIdsFromDatabase(
					deps.db,
					administratorRoles.map((role) => role.id),
				)
			: [];

	return [...new Set(assigns.map((assign) => assign.userId))].sort((a, b) => a.localeCompare(b));
}

async function getModeratorIdsForApi(
	deps: Pick<ApiAdminUsersDependencies, 'db' | 'meta'>,
	options: {
		includeAdmins: boolean;
		includeRoot?: boolean;
		excludeExpire?: boolean;
	},
): Promise<MiUser['id'][]> {
	const roles = await listRolesFromDatabase(deps.db);
	const moderatorRoles = options.includeAdmins
		? roles.filter((role) => role.isModerator || role.isAdministrator)
		: roles.filter((role) => role.isModerator);
	const assigns =
		moderatorRoles.length > 0
			? await listRoleAssignmentsByRoleIdsFromDatabase(
					deps.db,
					moderatorRoles.map((role) => role.id),
				)
			: [];

	const now = Date.now();
	const resultSet = new Set(
		assigns
			.filter((assign) => (options.excludeExpire ? assign.expiresAt == null || assign.expiresAt.getTime() > now : true))
			.map((assign) => assign.userId),
	);

	if (options.includeRoot && deps.meta.rootUserId) {
		resultSet.add(deps.meta.rootUserId);
	}

	return [...resultSet].sort((a, b) => a.localeCompare(b));
}

export async function getModeratorsForApi(
	deps: Pick<ApiAdminUsersDependencies, 'db' | 'meta'>,
	options: {
		includeAdmins: boolean;
		includeRoot?: boolean;
		excludeExpire?: boolean;
	},
): Promise<MiUser[]> {
	const ids = await getModeratorIdsForApi(deps, options);
	return ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
}

function packPublicUserRole(role: MiRole): {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	description: string;
	isModerator: boolean;
	isAdministrator: boolean;
	displayOrder: number;
} {
	return {
		id: role.id,
		name: role.name,
		color: role.color,
		iconUrl: role.iconUrl,
		description: role.description,
		isModerator: role.isModerator,
		isAdministrator: role.isAdministrator,
		displayOrder: role.displayOrder,
	};
}

async function packAdminUserDetailedForApi(
	deps: ApiAdminUsersDependencies,
	user: MiUser,
	base: UserDetailedNotMeApiResponse,
	hint?: {
		profile?: Awaited<ReturnType<typeof fetchUserProfileByUserIdOrFailFromDatabase>>;
		roles?: MiRole[];
		policies?: Awaited<ReturnType<typeof getApiRolePolicies>>;
	},
): Promise<UserDetailedNotMeApiResponse> {
	const [profile, roles] = await Promise.all([
		hint?.profile ?? fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id),
		hint?.roles ?? getApiUserRoles(deps, user),
	]);
	const policies = hint?.policies ?? (await getApiRolePolicies(deps, user, roles));
	const publicRoles = roles
		.filter((role) => role.isPublic)
		.sort((a, b) => b.displayOrder - a.displayOrder)
		.map(packPublicUserRole);

	return {
		...base,
		isSilenced: !policies.canPublicNote,
		canChat: policies.chatAvailability === 'available',
		roles: publicRoles,
		moderationNote: profile.moderationNote ?? '',
		twoFactorEnabled: profile.twoFactorEnabled,
		usePasswordLessLogin: profile.usePasswordLessLogin,
		securityKeys: false,
	};
}

async function packAdminUsersDetailedForApi(
	deps: ApiAdminUsersDependencies,
	users: MiUser[],
	baseUsers: UserDetailedNotMeApiResponse[],
): Promise<UserDetailedNotMeApiResponse[]> {
	const userIds = users.map((user) => user.id);
	const [profiles, roles, assignments] = await Promise.all([
		listUserProfilesByUserIdsFromDatabase(deps.db, userIds),
		listRolesFromDatabase(deps.db),
		listRoleAssignmentsByUserIdsFromDatabase(deps.db, userIds),
	]);
	const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
	const assignmentsByUserId = new Map<MiUser['id'], MiRoleAssignment[]>();
	for (const assignment of assignments) {
		let userAssignments = assignmentsByUserId.get(assignment.userId);
		if (userAssignments == null) {
			userAssignments = [];
			assignmentsByUserId.set(assignment.userId, userAssignments);
		}
		userAssignments.push(assignment);
	}

	return await Promise.all(
		users.map(async (user, index) => {
			const userRoles = computeApiUserRoles(deps, user, roles, assignmentsByUserId.get(user.id) ?? []);
			const policies = await getApiRolePolicies(deps, user, userRoles);
			const profile = profileByUserId.get(user.id);
			return await packAdminUserDetailedForApi(deps, user, baseUsers[index]!, {
				...(profile === undefined ? {} : { profile }),
				roles: userRoles,
				policies,
			});
		}),
	);
}

export async function handleApiAdminShowUser(
	deps: ApiAdminUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<AdminShowUserResponse> {
	const params = parseApiParams(adminShowUserParamDef, body);
	const [user, profile] = await Promise.all([
		fetchUserByIdFromDatabase(deps.db, params.userId),
		fetchUserProfileByUserIdFromDatabase(deps.db, params.userId),
	]);

	if (user == null || profile == null) {
		throw new Error('user not found');
	}

	const freshMe = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);
	if (!(await isApiAdministrator(deps, freshMe)) && (await isApiAdministrator(deps, user))) {
		throw new Error('cannot show info of admin');
	}

	const [policies, signins, assigns, roles, isModerator] = await Promise.all([
		getApiRolePolicies(deps, user),
		listSigninsByUserIdFromDatabase(deps.db, user.id),
		listRoleAssignmentsByUserIdFromDatabase(deps.db, user.id).then((result) => result.filter(isActiveRoleAssignment)),
		getApiUserRoles(deps, user),
		isApiModerator(deps, user),
	]);

	return {
		email: profile.email,
		emailVerified: profile.emailVerified,
		followedMessage: profile.followedMessage,
		autoAcceptFollowed: profile.autoAcceptFollowed,
		noCrawle: profile.noCrawle,
		preventAiLearning: profile.preventAiLearning,
		alwaysMarkNsfw: profile.alwaysMarkNsfw,
		autoSensitive: profile.autoSensitive,
		carefulBot: profile.carefulBot,
		injectFeaturedNote: profile.injectFeaturedNote,
		receiveAnnouncementEmail: profile.receiveAnnouncementEmail,
		mutedWords: profile.mutedWords,
		mutedInstances: profile.mutedInstances,
		notificationRecieveConfig: profile.notificationRecieveConfig,
		isModerator,
		isSilenced: !policies.canPublicNote,
		isSuspended: user.isSuspended,
		isHibernated: user.isHibernated,
		lastActiveDate: user.lastActiveDate ? user.lastActiveDate.toISOString() : null,
		moderationNote: profile.moderationNote ?? '',
		signins: signins.map((signin) => packApiSignin(deps, signin)),
		policies,
		roles: await packApiRoles(deps, roles),
		roleAssigns: assigns.map((assign) => ({
			createdAt: parseId(assign.id).date.toISOString(),
			expiresAt: assign.expiresAt ? assign.expiresAt.toISOString() : null,
			roleId: assign.roleId,
		})),
	};
}

export async function handleApiAdminShowUsers(
	deps: ApiAdminUsersDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeApiResponse[]> {
	const params = parseApiParams(adminShowUsersParamDef, body);
	let roleUserIds: MiUser['id'][] | null = null;

	switch (params.state) {
		case 'admin': {
			roleUserIds = await getAdministratorIds(deps);
			if (roleUserIds.length === 0) return [];
			break;
		}
		case 'moderator': {
			roleUserIds = await getModeratorIdsForApi(deps, { includeAdmins: false });
			if (roleUserIds.length === 0) return [];
			break;
		}
		case 'adminOrModerator': {
			roleUserIds = await getModeratorIdsForApi(deps, { includeAdmins: true });
			if (roleUserIds.length === 0) return [];
			break;
		}
	}

	const users = await listAdminUsersFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			offset: params.offset,
			sort: params.sort,
			state: params.state,
			origin: params.origin,
			usernamePrefix: params.username ? `${sqlLikeEscape(params.username.toLowerCase())}%` : null,
			hostname: params.hostname,
			roleUserIds,
		}),
	);
	const baseUsers = await packUserDetailedNotMeManyForApi(deps, users, me);

	return await packAdminUsersDetailedForApi(deps, users, baseUsers);
}
