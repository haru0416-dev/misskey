/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from 'drizzle-kit';

type CompiledDbConfig = {
	db: {
		host: string;
		port: number;
		db?: string;
		user?: string;
		pass?: string;
	};
};

const _dirname = dirname(fileURLToPath(import.meta.url));
const compiledConfigPath = resolve(_dirname, '../../built/.config.json');

if (!existsSync(compiledConfigPath)) {
	throw new Error("Compiled configuration file not found. Try running 'bun run compile-config'.");
}

const { db } = JSON.parse(readFileSync(compiledConfigPath, 'utf-8')) as CompiledDbConfig;

export default {
	dialect: 'postgresql',
	schema: './src/db/schema/*.ts',
	out: './migration',
	dbCredentials: {
		host: db.host,
		port: db.port,
		user: db.user,
		password: db.pass,
		database: db.db,
		ssl: false,
	},
} satisfies Config;
