/*
 * SPDX-FileCopyrightText: dakkar and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { IObject } from '../type.js';

export enum FetchAllowSoftFailMask {
	// softfail フラグを許可しない。
	Strict = 0,
	// requestUrl・finalUrl・objectId の値がすべて一致しない場合を許可する。
	//
	// ユーザー起点の検索では一般的だが、連合処理では許可しない。
	//
	// 許可される例:
	//   正常: https://alice.example.com/@user -> https://alice.example.com/user/:userId
	//   問題のある例: https://alice.example.com/redirect?url=https://bad.example.com/ -> https://bad.example.com/ -> https://alice.example.com/somethingElse
	NonCanonicalId = 1 << 0,
	// 最終オブジェクトのサブドメイン階層を、リクエスト URL より1階層深い範囲まで許可する。
	//
	// このフラグを有効にする呼び出し元は存在しない。限定的な構成で必要になった場合に、事前確認済みの選択肢として使えるよう残す。
	//
	// 許可される例:
	//   正常: https://example.com/@user -> https://activitypub.example.com/@user { id: 'https://activitypub.example.com/@user' }
	//   問題のある例: https://example.com/@user -> https://untrusted.example.com/@user { id: 'https://untrusted.example.com/@user' }
	MisalignedOrigin = 1 << 1,
	// リクエスト URL と返された object ID のホストが異なるが、最終 URL と object ID は一致する場合を許可する。
	//
	// 中間ホストを使うユーザー起点の検索では一般的だが、連合処理では許可しない。
	//
	// 許可される例:
	//   正常: https://alice.example.com/@user@bob.example.com -> https://bob.example.com/@user { id: 'https://bob.example.com/@user' }
	//   問題のある例: https://alice.example.com/definitelyAlice -> https://bob.example.com/@somebodyElse { id: 'https://bob.example.com/@somebodyElse' }
	CrossOrigin = (1 << 2) | MisalignedOrigin,
	// すべての softfail フラグを許可する。
	//
	// リリース用コードでは使用しない。
	Any = ~0,
}

/**
 * candidate host が request host の管理下にあるかを緩やかに判定する。
 *
 * @param requestHost リクエスト対象リソースのホスト
 * @param candidateHost 最終レスポンスのホスト
 * @returns candidate host が request host を管理しているか、または一致に softfail が必要な場合のフラグ
 */
function hostFuzzyMatch(requestHost: string, candidateHost: string): FetchAllowSoftFailMask {
	const requestFqdn = requestHost.endsWith('.') ? requestHost : `${requestHost}.`;
	const candidateFqdn = candidateHost.endsWith('.') ? candidateHost : `${candidateHost}.`;

	if (requestFqdn === candidateFqdn) {
		return FetchAllowSoftFailMask.Strict;
	}

	// candidateHost が requestHost の1階層下にある場合だけ許可する。
	const requestDnsDepth = requestFqdn.split('.').length;
	const candidateDnsDepth = candidateFqdn.split('.').length;

	if (candidateDnsDepth - requestDnsDepth !== 1) {
		return FetchAllowSoftFailMask.CrossOrigin;
	}

	if (`.${candidateHost}`.endsWith(`.${requestHost}`)) {
		return FetchAllowSoftFailMask.MisalignedOrigin;
	}

	return FetchAllowSoftFailMask.CrossOrigin;
}

// www. 接頭辞を除いて同一視できるホスト名へ正規化する。
function normalizeSynonymousSubdomain(url: URL | string): URL {
	const urlParsed = url instanceof URL ? url : new URL(url);
	const host = urlParsed.host;
	const normalizedHost = host.replace(/^www\./, '');
	return new URL(urlParsed.toString().replace(host, normalizedHost));
}

export function assertActivityMatchesUrl(
	requestUrl: string | URL,
	activity: IObject,
	finalUrl: string | URL,
	allowSoftfail: FetchAllowSoftFailMask,
): FetchAllowSoftFailMask {
	// 管理権限を検証するため、Activity ID は必須とする。
	if (!activity.id) {
		throw new Error('bad Activity: missing id field');
	}

	let softfail = 0;

	// 許可されたフラグなら戻り値へ設定し、許可されていなければ例外にする。
	const requireSoftfail = (needed: FetchAllowSoftFailMask, message: string) => {
		if ((allowSoftfail & needed) !== needed) {
			throw new Error(message);
		}

		softfail |= needed;
	};

	const requestUrlParsed = normalizeSynonymousSubdomain(requestUrl);
	const idParsed = normalizeSynonymousSubdomain(activity.id);

	const finalUrlParsed = normalizeSynonymousSubdomain(finalUrl);

	// Mastodon は URL にハッシュを含む Activity を送ることがあるが、object ID にはハッシュを含めない。
	requestUrlParsed.hash = '';
	finalUrlParsed.hash = '';

	const requestUrlSecure = requestUrlParsed.protocol === 'https:';
	const finalUrlSecure = finalUrlParsed.protocol === 'https:';
	if (requestUrlSecure && !finalUrlSecure) {
		throw new Error(`bad Activity: id(${activity.id}) is not allowed to have http:// in the url`);
	}

	// 最終 URL と ID を比較する。
	if (finalUrlParsed.href !== idParsed.href) {
		requireSoftfail(
			FetchAllowSoftFailMask.NonCanonicalId,
			`bad Activity: id(${activity.id}) does not match response url(${finalUrlParsed.toString()})`,
		);

		// ActivityPub の要件により、ホストは完全一致させる。
		if (idParsed.host !== finalUrlParsed.host) {
			throw new Error(`bad Activity: id(${activity.id}) does not match response host(${finalUrlParsed.host})`);
		}
	}

	// リクエスト URL と ID を比較する。
	if (requestUrlParsed.href !== idParsed.href) {
		requireSoftfail(
			FetchAllowSoftFailMask.NonCanonicalId,
			`bad Activity: id(${activity.id}) does not match request url(${requestUrlParsed.toString()})`,
		);

		// cross-origin 検索を許可した場合は、最終 URL と ID の一致を保ったまま、リクエスト URL と最終 object ID の差異を許可する。
		const hostResult = hostFuzzyMatch(requestUrlParsed.host, idParsed.host);

		requireSoftfail(
			hostResult,
			`bad Activity: id(${activity.id}) is valid but is not the same origin as request url(${requestUrlParsed.toString()})`,
		);
	}

	return softfail;
}
