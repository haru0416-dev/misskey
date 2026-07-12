/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const tag = process.argv[2];
const repository = process.env.GITHUB_REPOSITORY;

if (!tag || !repository) {
	throw new Error('Usage: validate-release.mjs <tag> with GITHUB_REPOSITORY set');
}

const ghJson = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const jsonAtTag = (path) => JSON.parse(git('show', `refs/tags/${tag}:${path}`));
const release = ghJson(`repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
const repositoryData = ghJson(`repos/${repository}`);

if (release.draft) {
	throw new Error(`Release ${tag} is still a draft`);
}
if (release.tag_name !== tag) {
	throw new Error(`Release tag mismatch: expected ${tag}, got ${release.tag_name}`);
}

const tagCommit = git('rev-parse', `refs/tags/${tag}^{commit}`);
const onDefaultBranch = (() => {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', tagCommit, `origin/${repositoryData.default_branch}`]);
		return true;
	} catch {
		return false;
	}
})();
const isOpenPullRequestHead = ghJson(`repos/${repository}/pulls?state=open&per_page=100`).some(
	(pullRequest) => pullRequest.head?.sha === tagCommit,
);
if (!onDefaultBranch && !isOpenPullRequestHead) {
	throw new Error(
		`Release commit ${tagCommit} is neither on ${repositoryData.default_branch} nor the head of an open pull request`,
	);
}
const rootPackage = jsonAtTag('package.json');
const misskeyJsPackage = jsonAtTag('packages/misskey-js/package.json');

if (rootPackage.version !== misskeyJsPackage.version) {
	throw new Error(`Package version mismatch: root=${rootPackage.version}, misskey-js=${misskeyJsPackage.version}`);
}
if (tag !== rootPackage.version) {
	throw new Error(`Release tag ${tag} does not match package version ${rootPackage.version}`);
}

console.log(`Validated published release ${tag} at ${tagCommit}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${tagCommit}\n`);
