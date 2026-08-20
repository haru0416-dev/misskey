/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ランタイムへ YAML パーサーを含めないため、ビルド時に設定を JSON へ変換する。
 */

import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const configDir = resolve(_dirname, '../../../.config');
const OUTPUT_PATH = resolve(_dirname, '../../../built/.config.json');

/**
 * @param {string} ymlPath - YAMLファイルのパス
 */
function yamlToJson(ymlPath) {
	if (!fs.existsSync(ymlPath)) {
		fs.rmSync(OUTPUT_PATH, { force: true });
		throw new Error(`YAML file not found: ${ymlPath}`);
	}

	console.log(`${ymlPath} → ${OUTPUT_PATH}`);

	const yamlContent = fs.readFileSync(ymlPath, 'utf-8');
	const jsonContent = Bun.YAML.parse(yamlContent);
	return { yamlContent, jsonContent };
}

async function compileConfig(ymlPath) {
	try {
		const { yamlContent, jsonContent } = yamlToJson(ymlPath);
		const sourceSchemaPath = resolve(_dirname, '../src/config-schema.ts');
		const builtSchemaPath = resolve(_dirname, '../built/config-schema.js');
		const schemaPath = fs.existsSync(sourceSchemaPath) ? sourceSchemaPath : builtSchemaPath;
		const { sourceConfigV2Schema, compiledConfigEnvelopeSchema } = await import(pathToFileURL(schemaPath).href);
		const config = sourceConfigV2Schema.parse(jsonContent);
		const envelope = compiledConfigEnvelopeSchema.parse({
			compiledConfigVersion: 1,
			sourceSha256: createHash('sha256').update(yamlContent).digest('hex'),
			config,
		});

		if (!fs.existsSync(dirname(OUTPUT_PATH))) {
			fs.mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
		}
		const temporaryOutputPath = `${OUTPUT_PATH}.${process.pid}.tmp`;
		fs.writeFileSync(temporaryOutputPath, JSON.stringify(envelope), { encoding: 'utf-8', mode: 0o600 });
		fs.renameSync(temporaryOutputPath, OUTPUT_PATH);
	} catch (error) {
		fs.rmSync(OUTPUT_PATH, { force: true });
		throw error;
	}
}

if (process.env.MISSKEY_CONFIG_YML) {
	const customYmlPath = resolve(configDir, process.env.MISSKEY_CONFIG_YML);
	await compileConfig(customYmlPath);
} else {
	await compileConfig(resolve(configDir, process.env.NODE_ENV === 'test' ? 'test.yml' : 'default.yml'));
}

console.log('Configuration compiled ✓');
