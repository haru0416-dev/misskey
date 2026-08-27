/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readText = (path) => readFileSync(path, 'utf8').trim();

const packageJson = readJson('package.json');
const backendPackageJson = readJson('packages/backend/package.json');
const frontendPackageJson = readJson('packages/frontend/package.json');
const frontendEmbedPackageJson = readJson('packages/frontend-embed/package.json');
const changelogCheckerPackageJson = readJson('scripts/changelog-checker/package.json');
const devcontainerJson = readJson('.devcontainer/devcontainer.json');
const bunVersion = readText('.bun-version');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const devcontainerDockerfile = readFileSync('.devcontainer/Dockerfile', 'utf8');
const bunfig = readFileSync('bunfig.toml', 'utf8');

const packageManagerMatch = packageJson.packageManager.match(/^bun@(?<version>.+)$/);
const dockerBunVersionMatch = dockerfile.match(/^ARG BUN_VERSION=(?<version>\S+)/m);

const versions = {
	bun: bunVersion,
	engineBun: packageJson.engines?.bun,
	backendEngineBun: backendPackageJson.engines?.bun,
	changelogCheckerEngineBun: changelogCheckerPackageJson.engines?.bun,
	packageManagerBun: packageManagerMatch?.groups?.version,
	dockerBun: dockerBunVersionMatch?.groups?.version,
	devcontainerBaseImage: devcontainerDockerfile.match(/^FROM (?<image>\S+)/m)?.groups?.image,
	devcontainerBun: devcontainerJson.features?.['ghcr.io/devcontainers-extra/features/bun:1']?.version,
	linker: bunfig.match(/^linker = "(?<value>.+)"$/m)?.groups?.value,
};

const checks = [
	['package.json packageManager must be bun@<version>', Boolean(versions.packageManagerBun)],
	['package.json packageManager must match .bun-version', versions.packageManagerBun === versions.bun],
	['package.json engines.bun must match .bun-version', versions.engineBun === `^${versions.bun}`],
	['backend engines.bun must match .bun-version', versions.backendEngineBun === `^${versions.bun}`],
	['changelog-checker engines.bun must match .bun-version', versions.changelogCheckerEngineBun === `^${versions.bun}`],
	['Dockerfile ARG BUN_VERSION must be set', Boolean(versions.dockerBun)],
	['Dockerfile Bun version must match .bun-version', versions.dockerBun === versions.bun],
	[
		'devcontainer base image must not pin a separate Node.js version',
		versions.devcontainerBaseImage === 'mcr.microsoft.com/devcontainers/base:trixie',
	],
	['devcontainer Bun feature must match .bun-version', versions.devcontainerBun === versions.bun],
	['package.json must not declare a Node.js engine', !packageJson.engines?.node],
	['backend package.json must not declare a Node.js engine', !backendPackageJson.engines?.node],
	['changelog-checker package.json must not declare a Node.js engine', !changelogCheckerPackageJson.engines?.node],
	['package.json must not depend on pnpm', !packageJson.devDependencies?.pnpm && !packageJson.dependencies?.pnpm],
	[
		'backend migrations must run through the Bun migration runner',
		backendPackageJson.scripts?.migrate === 'bun run compile-config && bun ./built/migration-runner.js up',
	],
	['backend package.json must not expose a migration revert script', backendPackageJson.scripts?.revert == null],
	['backend must not depend on the native re2 package (unusable under Bun)', !backendPackageJson.dependencies?.re2],
	['native re2 must not be trusted for lifecycle builds', !packageJson.trustedDependencies?.includes('re2')],
	['bunfig.toml must use isolated installs', versions.linker === 'isolated'],
	[
		'the native TypeScript compiler must come from the released typescript package',
		(packageJson.devDependencies?.['typescript-native'] ?? '').startsWith('npm:typescript@7.'),
	],
	[
		'@typescript/native-preview must not come back (its channel stopped publishing at 7.0.0-dev.20260707.2)',
		!packageJson.devDependencies?.['@typescript/native-preview'],
	],
	[
		'the classic TypeScript API must stay on 6.x (vue-tsc / api-extractor / i18n codegen need it)',
		(packageJson.devDependencies?.typescript ?? '').startsWith('6.'),
	],
	[
		'frontend typecheck must use Bun-compatible vue-tsc runner',
		(frontendPackageJson.scripts?.typecheck ?? '').startsWith('bun ../../scripts/vue-tsc-bun.cjs --noEmit'),
	],
	[
		'frontend-embed typecheck must use Bun-compatible vue-tsc runner',
		frontendEmbedPackageJson.scripts?.typecheck === 'bun ../../scripts/vue-tsc-bun.cjs --noEmit',
	],
];

const failures = checks.filter(([, pass]) => !pass);

if (failures.length > 0) {
	console.error('Runtime version checks failed:');
	for (const [message] of failures) {
		console.error(`- ${message}`);
	}
	console.error(`\nResolved versions: ${JSON.stringify(versions, null, '\t')}`);
	process.exit(1);
}

console.log(`Runtime versions are aligned: Bun ${versions.bun}`);
