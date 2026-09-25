/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { permissions } from 'misskey-js';
import type { z } from 'zod';
import type { KeyOf, Schema } from '@/misc/json-schema.js';

import { endpointMetas } from './endpoint-metas.js';

interface IEndpointMetaBase {
	readonly tags?: readonly string[];

	readonly errors?: {
		readonly [key: string]: {
			readonly message: string;
			readonly code: string;
			readonly id: string;
			readonly httpStatusCode?: number;
			readonly kind?: 'client' | 'server' | 'permission';
			readonly info?: unknown;
		};
	};

	readonly res?: Schema;

	/** ユーザーの資格情報を必須とするか。省略時は false。 */
	readonly requireCredential?: boolean;

	/** isModerator なロールを必要とするか。 */
	readonly requireModerator?: boolean;

	/** isAdministrator なロールを必要とするか。 */
	readonly requireAdmin?: boolean;

	readonly requiredRolePolicy?: KeyOf<'RolePolicies'>;

	/** 引っ越し済みのユーザーによるリクエストを禁止するか。省略時は false。 */
	readonly prohibitMoved?: boolean;

	/**
	 * 実行に必要なロールポリシー名。root は常に通る。
	 * 権限 (kind) とは別軸で、インスタンスがロールで許可を配る種類の制限に使う。
	 */
	readonly requireRolePolicy?: string;

	/** レート制限。省略時は制限なし。 */
	readonly limit?: {
		/** 複数のエンドポイントで制限を共有するときのキー。 */
		readonly key?: string;

		/** 制限を適用する期間 (ms)。max と組で指定する。 */
		readonly duration?: number;

		/** duration の期間内に許すリクエスト数。duration と組で指定する。 */
		readonly max?: number;

		/** リクエスト間に最低限空ける間隔 (ms)。 */
		readonly minInterval?: number;
	};

	/** ファイルの添付を必須とするか。省略時は false。 */
	readonly requireFile?: boolean;

	/** サードパーティアプリからのリクエストを禁止するか。省略時は false。 */
	readonly secure?: boolean;

	/** トークンの権限判定に使うエンドポイントの種類。 */
	readonly kind?: string;

	readonly description?: string;

	/** GET でのリクエストを許すか。 */
	readonly allowGet?: boolean;
	/**
	 * QUERY (RFC 10008) でも受け付けるか。safe かつ idempotent な読み取りにのみ付けること。
	 * 書き込みに付けると中間プロキシが安全に再送してよいものとして扱う。
	 */
	readonly allowQuery?: boolean;

	/** 正常応答をキャッシュ (Cache-Control: public) する秒数。 */
	readonly cacheSec?: number;
}

export type IEndpointMeta =
	| (Omit<IEndpointMetaBase, 'requireCrential' | 'requireModerator' | 'requireAdmin'> & {
			requireCredential?: false;
			requireAdmin?: false;
			requireModerator?: false;
	  })
	| (Omit<IEndpointMetaBase, 'secure'> & {
			secure: true;
	  })
	| (Omit<IEndpointMetaBase, 'requireCredential' | 'kind'> & {
			requireCredential: true;
			kind: (typeof permissions)[number];
	  })
	| (Omit<IEndpointMetaBase, 'requireModerator' | 'kind'> & {
			requireModerator: true;
			kind: (typeof permissions)[number];
	  })
	| (Omit<IEndpointMetaBase, 'requireAdmin' | 'kind'> & {
			requireAdmin: true;
			kind: (typeof permissions)[number];
	  });

export interface IEndpoint {
	name: string;
	meta: IEndpointMeta;
	// admin/update-meta の paramDef (AdminUpdateMetaLogic.ts の adminUpdateMetaJsonSchema) だけが
	// JSON Schema 形式なので Schema も受け付ける。
	params: Schema | z.ZodType;
}

const endpoints: IEndpoint[] = Object.entries(endpointMetas).map(([name, ep]) => {
	return {
		name,
		get meta() {
			return ep.meta ?? {};
		},
		get params() {
			return ep.paramDef;
		},
	};
});

export default endpoints;
