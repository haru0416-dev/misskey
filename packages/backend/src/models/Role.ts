/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


/**
 * ～かつ～
 * 複数の条件を同時に満たす場合のみ成立とする
 */
type CondFormulaValueAnd = {
	type: 'and';
	values: RoleCondFormulaValue[];
};

/**
 * ～または～
 * 複数の条件のうち、いずれかを満たす場合のみ成立とする
 */
type CondFormulaValueOr = {
	type: 'or';
	values: RoleCondFormulaValue[];
};

/**
 * ～ではない
 * 条件を満たさない場合のみ成立とする
 */
type CondFormulaValueNot = {
	type: 'not';
	value: RoleCondFormulaValue;
};

/**
 * ローカルユーザーのみ成立とする
 */
type CondFormulaValueIsLocal = {
	type: 'isLocal';
};

/**
 * リモートユーザーのみ成立とする
 */
type CondFormulaValueIsRemote = {
	type: 'isRemote';
};

/**
 * 既に指定のマニュアルロールにアサインされている場合のみ成立とする
 */
type CondFormulaValueRoleAssignedTo = {
	type: 'roleAssignedTo';
	roleId: string;
};

/**
 * サスペンド済みアカウントの場合のみ成立とする
 */
type CondFormulaValueIsSuspended = {
	type: 'isSuspended';
};

/**
 * 鍵アカウントの場合のみ成立とする
 */
type CondFormulaValueIsLocked = {
	type: 'isLocked';
};

/**
 * botアカウントの場合のみ成立とする
 */
type CondFormulaValueIsBot = {
	type: 'isBot';
};

/**
 * 猫アカウントの場合のみ成立とする
 */
type CondFormulaValueIsCat = {
	type: 'isCat';
};

/**
 * 「ユーザを見つけやすくする」が有効なアカウントの場合のみ成立とする
 */
type CondFormulaValueIsExplorable = {
	type: 'isExplorable';
};

/**
 * ユーザが作成されてから指定期間経過した場合のみ成立とする
 */
type CondFormulaValueCreatedLessThan = {
	type: 'createdLessThan';
	sec: number;
};

/**
 * ユーザが作成されてから指定期間経っていない場合のみ成立とする
 */
type CondFormulaValueCreatedMoreThan = {
	type: 'createdMoreThan';
	sec: number;
};

/**
 * フォロワー数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueFollowersLessThanOrEq = {
	type: 'followersLessThanOrEq';
	value: number;
};

/**
 * フォロワー数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueFollowersMoreThanOrEq = {
	type: 'followersMoreThanOrEq';
	value: number;
};

/**
 * フォロー数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueFollowingLessThanOrEq = {
	type: 'followingLessThanOrEq';
	value: number;
};

/**
 * フォロー数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueFollowingMoreThanOrEq = {
	type: 'followingMoreThanOrEq';
	value: number;
};

/**
 * 投稿数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueNotesLessThanOrEq = {
	type: 'notesLessThanOrEq';
	value: number;
};

/**
 * 投稿数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueNotesMoreThanOrEq = {
	type: 'notesMoreThanOrEq';
	value: number;
};

export type RoleCondFormulaValue = { id: string } & (
	CondFormulaValueAnd |
	CondFormulaValueOr |
	CondFormulaValueNot |
	CondFormulaValueIsLocal |
	CondFormulaValueIsRemote |
	CondFormulaValueIsSuspended |
	CondFormulaValueIsLocked |
	CondFormulaValueIsBot |
	CondFormulaValueIsCat |
	CondFormulaValueIsExplorable |
	CondFormulaValueRoleAssignedTo |
	CondFormulaValueCreatedLessThan |
	CondFormulaValueCreatedMoreThan |
	CondFormulaValueFollowersLessThanOrEq |
	CondFormulaValueFollowersMoreThanOrEq |
	CondFormulaValueFollowingLessThanOrEq |
	CondFormulaValueFollowingMoreThanOrEq |
	CondFormulaValueNotesLessThanOrEq |
	CondFormulaValueNotesMoreThanOrEq
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

	public policies: Record<string, {
		useDefault: boolean;
		priority: number;
		value: any;
	}>;
}
