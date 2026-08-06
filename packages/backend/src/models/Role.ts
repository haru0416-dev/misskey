/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type CondFormulaValueAnd = {
	type: 'and';
	values: RoleCondFormulaValue[];
};

type CondFormulaValueOr = {
	type: 'or';
	values: RoleCondFormulaValue[];
};

type CondFormulaValueNot = {
	type: 'not';
	value: RoleCondFormulaValue;
};

type CondFormulaValueIsLocal = {
	type: 'isLocal';
};

type CondFormulaValueIsRemote = {
	type: 'isRemote';
};

type CondFormulaValueRoleAssignedTo = {
	type: 'roleAssignedTo';
	roleId: string;
};

type CondFormulaValueIsSuspended = {
	type: 'isSuspended';
};

type CondFormulaValueIsLocked = {
	type: 'isLocked';
};

type CondFormulaValueIsBot = {
	type: 'isBot';
};

type CondFormulaValueIsCat = {
	type: 'isCat';
};

type CondFormulaValueIsExplorable = {
	type: 'isExplorable';
};

type CondFormulaValueCreatedLessThan = {
	type: 'createdLessThan';
	sec: number;
};

type CondFormulaValueCreatedMoreThan = {
	type: 'createdMoreThan';
	sec: number;
};

type CondFormulaValueFollowersLessThanOrEq = {
	type: 'followersLessThanOrEq';
	value: number;
};

type CondFormulaValueFollowersMoreThanOrEq = {
	type: 'followersMoreThanOrEq';
	value: number;
};

type CondFormulaValueFollowingLessThanOrEq = {
	type: 'followingLessThanOrEq';
	value: number;
};

type CondFormulaValueFollowingMoreThanOrEq = {
	type: 'followingMoreThanOrEq';
	value: number;
};

type CondFormulaValueNotesLessThanOrEq = {
	type: 'notesLessThanOrEq';
	value: number;
};

type CondFormulaValueNotesMoreThanOrEq = {
	type: 'notesMoreThanOrEq';
	value: number;
};

export type RoleCondFormulaValue = { id: string } & (
	| CondFormulaValueAnd
	| CondFormulaValueOr
	| CondFormulaValueNot
	| CondFormulaValueIsLocal
	| CondFormulaValueIsRemote
	| CondFormulaValueIsSuspended
	| CondFormulaValueIsLocked
	| CondFormulaValueIsBot
	| CondFormulaValueIsCat
	| CondFormulaValueIsExplorable
	| CondFormulaValueRoleAssignedTo
	| CondFormulaValueCreatedLessThan
	| CondFormulaValueCreatedMoreThan
	| CondFormulaValueFollowersLessThanOrEq
	| CondFormulaValueFollowersMoreThanOrEq
	| CondFormulaValueFollowingLessThanOrEq
	| CondFormulaValueFollowingMoreThanOrEq
	| CondFormulaValueNotesLessThanOrEq
	| CondFormulaValueNotesMoreThanOrEq
);

export class MiRole {
	public id: string;

	public updatedAt: Date;

	public lastUsedAt: Date;

	public name: string;

	public description: string;

	public color: string | null;

	public iconUrl: string | null;

	public target: 'manual' | 'conditional';

	public condFormula: RoleCondFormulaValue;

	public isPublic: boolean;

	// trueの場合ユーザー名の横にバッジとして表示
	public asBadge: boolean;

	public isModerator: boolean;

	public isAdministrator: boolean;

	public isExplorable: boolean;

	public preserveAssignmentOnMoveAccount: boolean;

	public canEditMembersByModerator: boolean;

	// UIに表示する際の並び順用(大きいほど先頭)
	public displayOrder: number;

	public policies: Record<
		string,
		{
			useDefault: boolean;
			priority: number;
			value: any;
		}
	>;
}
