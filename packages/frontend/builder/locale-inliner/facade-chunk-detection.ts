/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import type { Logger } from '../logger.js';
import type { ESTree as RolldownESTree } from 'rolldown/utils';

interface FacadeInfo {
	fileName: string;
	// facade の公開名から内部名への対応表
	nameMap: Partial<Record<string, string>>;
}

export function detectI18nFacadeChunk(sourceCode: string, fileName: string, fileLogger: Logger): FacadeInfo | null {
	let programNode: RolldownESTree.Program;
	try {
		programNode = parseAst(sourceCode);
	} catch (err) {
		fileLogger.error(`Failed to parse source code: ${err}`);
		return null;
	}
	if (programNode.sourceType !== 'module') {
		fileLogger.error('Source code is not a module.');
		return null;
	}

	// import と export だけからなるモジュールを facade として扱う。
	if (programNode.body.length !== 2) return null;
	const [importDecl, exportDecl] = programNode.body;
	if (importDecl?.type !== 'ImportDeclaration') return null;
	if (exportDecl?.type !== 'ExportNamedDeclaration') return null;

	const sourcePath = importDecl.source.value;
	const sourceName = path.posix.basename(sourcePath);

	const importNameMap = Object.fromEntries(
		importDecl.specifiers.map((specifier) => {
			if (specifier.type !== 'ImportSpecifier')
				throw new Error(`${fileName}: Unexpected import specifier in facade module: ${specifier.type}`);
			const exportName = getExportName(specifier.imported);
			const localName = specifier.local.name;
			return [localName, exportName];
		}),
	);
	const nameMap = Object.fromEntries(
		exportDecl.specifiers.map((spec) => {
			const localName = getExportName(spec.local);
			const facadeExportName = getExportName(spec.exported);
			const moduleExportName = importNameMap[localName];
			return [facadeExportName, moduleExportName];
		}),
	);

	return {
		fileName: sourceName,
		nameMap,
	};
}

function getExportName(node: RolldownESTree.ModuleExportName): string {
	return node.type === 'Literal' ? node.value : node.name;
}
