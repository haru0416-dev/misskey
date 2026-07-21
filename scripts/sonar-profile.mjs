/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// dev/sonarqube/rule-overrides.json の定義を SonarQube の Quality Profile へ適用する。
// 'Sonar way' を複製した 'Misskey way' を作り、ノイズ・誤検出のルールだけを無効化して
// misskey プロジェクトに割り当てる。既に存在する場合は無効化状態を貼り直す。

import { readFileSync } from 'node:fs';

const BASE = process.env.SONAR_HOST_URL ?? 'http://127.0.0.1:9000';
const TOKEN = process.env.SONAR_TOKEN;
const PROJECT = 'misskey';

if (!TOKEN) {
	console.error('error: SONAR_TOKEN が未設定です。dev/sonarqube/.env を読み込んでから実行してください。');
	process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${TOKEN}:`).toString('base64');

async function api(path, params = {}, method = 'GET') {
	const query = new URLSearchParams(params).toString();
	const url = method === 'GET' ? `${BASE}${path}?${query}` : `${BASE}${path}`;
	const res = await fetch(url, {
		method,
		headers: {
			Authorization: auth,
			...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
		},
		body: method === 'POST' ? query : undefined,
	});
	if (!res.ok) {
		throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : null;
}

const overrides = JSON.parse(readFileSync('dev/sonarqube/rule-overrides.json', 'utf8'));
const profileName = overrides.profileName;
const disabled = Object.entries(overrides.disable).filter(([key]) => !key.startsWith('$'));

// ルールキーの言語部分 (typescript:S123 の 'typescript') は Quality Profile の言語キー
// ('ts') と一致しないため、SonarQube に問い合わせて対応付ける。
const ruleLanguage = new Map();
for (const [key] of disabled) {
	const found = await api('/api/rules/search', { rule_key: key, ps: '1', f: 'lang' });
	if (found.rules.length === 0) {
		console.warn(`warn: ルール ${key} は存在しません (プラグイン未導入かキーの誤り)。読み飛ばします。`);
		continue;
	}
	ruleLanguage.set(key, found.rules[0].lang);
}

const existing = await api('/api/qualityprofiles/search', {});
let applied = 0;

for (const language of overrides.languages) {
	const sonarWay = existing.profiles.find(p => p.language === language && p.name === 'Sonar way');
	if (!sonarWay) {
		console.warn(`warn: 言語 ${language} の 'Sonar way' が見つかりません。読み飛ばします。`);
		continue;
	}

	let profile = existing.profiles.find(p => p.language === language && p.name === profileName);
	if (!profile) {
		const copied = await api('/api/qualityprofiles/copy', { fromKey: sonarWay.key, toName: profileName }, 'POST');
		profile = { key: copied.key, language, name: profileName };
		console.log(`created: ${profileName} (${language}) <- Sonar way`);
	}

	const targets = disabled.filter(([key]) => ruleLanguage.get(key) === language);
	for (const [key, reason] of targets) {
		await api('/api/qualityprofiles/deactivate_rule', { key: profile.key, rule: key }, 'POST');
		console.log(`  disabled ${key}  (${reason})`);
		applied++;
	}

	await api('/api/qualityprofiles/add_project', { qualityProfile: profileName, language, project: PROJECT }, 'POST');
}

console.log(`\n${applied} ルールを無効化し、${PROJECT} に '${profileName}' を割り当てました。`);
console.log('反映するには再スキャンしてください: bun run lint:sonar');
