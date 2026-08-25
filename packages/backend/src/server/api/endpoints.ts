/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { permissions } from 'misskey-js';
import type { z } from 'zod';
import type { KeyOf, Schema } from '@/misc/json-schema.js';

import { endpointMetas } from './endpoint-metas.js';

interface IEndpointMetaBase {
	readonly tags?: ReadonlyArray<string>;

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

	/**
	 * このエンドポイントにリクエストするのにユーザー情報が必須か否か
	 * 省略した場合は false として解釈されます。
	 */
	readonly requireCredential?: boolean;

	/**
	 * isModeratorなロールを必要とするか
	 */
	readonly requireModerator?: boolean;

	/**
	 * isAdministratorなロールを必要とするか
	 */
	readonly requireAdmin?: boolean;

	readonly requiredRolePolicy?: KeyOf<'RolePolicies'>;

	/**
	 * 引っ越し済みのユーザーによるリクエストを禁止するか
	 * 省略した場合は false として解釈されます。
	 */
	readonly prohibitMoved?: boolean;

	/**
	 * 実行に必要なロールポリシー名。root は常に通る。
	 * 権限 (kind) とは別軸で、インスタンスがロールで許可を配る種類の制限に使う。
	 */
	readonly requireRolePolicy?: string;

	/**
	 * エンドポイントのリミテーションに関するやつ
	 * 省略した場合はリミテーションは無いものとして解釈されます。
	 */
	readonly limit?: {
		/**
		 * 複数のエンドポイントでリミットを共有したい場合に指定するキー
		 */
		readonly key?: string;

		/**
		 * リミットを適用する期間(ms)
		 * このプロパティを設定する場合、max プロパティも設定する必要があります。
		 */
		readonly duration?: number;

		/**
		 * durationで指定した期間内にいくつまでリクエストできるのか
		 * このプロパティを設定する場合、duration プロパティも設定する必要があります。
		 */
		readonly max?: number;

		/**
		 * 最低でもどれくらいの間隔を開けてリクエストしなければならないか(ms)
		 */
		readonly minInterval?: number;
	};

	/**
	 * ファイルの添付を必要とするか否か
	 * 省略した場合は false として解釈されます。
	 */
	readonly requireFile?: boolean;

	/**
	 * サードパーティアプリからはリクエストすることができないか否か
	 * 省略した場合は false として解釈されます。
	 */
	readonly secure?: boolean;

	/**
	 * エンドポイントの種類
	 * パーミッションの実現に利用されます。
	 */
	readonly kind?: string;

	readonly description?: string;

	/**
	 * GETでのリクエストを許容するか否か
	 */
	readonly allowGet?: boolean;
	/**
	 * QUERY (RFC 10008) でも受け付けるか。safe かつ idempotent な読み取りにのみ付けること。
	 * 書き込みに付けると中間プロキシが安全に再送してよいものとして扱う。
	 */
	readonly allowQuery?: boolean;

	/**
	 * 正常応答をキャッシュ (Cache-Control: public) する秒数
	 */
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
	// 429件中428件の paramDef が z.ZodType 化済み。残り1件 (admin/update-meta の
	// adminUpdateMetaJsonSchema, AdminUpdateMetaLogic.ts) は JSON Schema 形式のため、
	// Schema 側の型も受け付ける。
	params: Schema | z.ZodType;
}

const endpoints: IEndpoint[] = Object.entries(endpointMetas).map(([name, ep]) => {
	return {
		name: name,
		get meta() {
			return ep.meta ?? {};
		},
		get params() {
			return ep.paramDef;
		},
	};
});

export default endpoints;
