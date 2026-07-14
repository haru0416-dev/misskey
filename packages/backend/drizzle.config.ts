/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from 'drizzle-kit';

type CompiledDbConfig = {
	config: {
		database: {
			primary: {
				host: string;
				port: number;
				name: string;
				user: string;
				password: { fromEnvironment: string } | { plainText: string };
				ssl?: boolean;
			};
		};
	};
};

const _dirname = dirname(fileURLToPath(import.meta.url));
const compiledConfigPath = resolve(_dirname, '../../built/.config.json');

if (!existsSync(compiledConfigPath)) {
	throw new Error("Compiled configuration file not found. Try running 'bun run compile-config'.");
}

const { config } = JSON.parse(readFileSync(compiledConfigPath, 'utf-8')) as CompiledDbConfig;
const database = config.database.primary;
const password = 'plainText' in database.password
	? database.password.plainText
	: process.env[database.password.fromEnvironment];
if (password == null) throw new Error(`Environment variable ${database.password.fromEnvironment} is required.`);

export default {
	dialect: 'postgresql',
	schema: './src/db/schema/*.ts',
	out: './migration',
	dbCredentials: {
		host: database.host,
		port: database.port,
		user: database.user,
		password,
		database: database.name,
		...(database.ssl == null ? {} : { ssl: database.ssl }),
	},
} satisfies Config;
