/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { walk } from 'oxc-walker';
import type { ESTree } from 'rolldown/utils';
import type { RolldownMagicString } from 'rolldown';
import type { ChunkRewrite } from './rewrite-chunks.js';

type IdentifierNode = Extract<ESTree.Node, { type: 'Identifier' }>;

function isFalsyIdentifier(identifier: IdentifierNode): boolean {
	return identifier.name === 'undefined' || identifier.name === 'NaN';
}

function normalizeClassWalker(tree: ESTree.Node, stack: string | undefined): string | null {
	if (tree.type === 'Identifier') {
		return isFalsyIdentifier(tree) ? '' : null;
	}
	if (tree.type === 'Literal') {
		return typeof tree.value === 'string' ? tree.value : '';
	}
	if (tree.type === 'BinaryExpression') {
		if (tree.operator !== '+') {
			return null;
		}
		const left = normalizeClassWalker(tree.left, stack);
		const right = normalizeClassWalker(tree.right, stack);
		if (left === null || right === null) {
			return null;
		}
		return `${left}${right}`;
	}
	if (tree.type === 'TemplateLiteral') {
		if (tree.expressions.some((x) => x.type !== 'Literal' && (x.type !== 'Identifier' || !isFalsyIdentifier(x)))) {
			return null;
		}
		return tree.quasis.reduce((a, c, i) => {
			const v =
				i === tree.quasis.length - 1
					? ''
					: (tree.expressions[i] as Partial<Extract<ESTree.Node, { type: 'Literal' }>>).value;
			return a + c.value.raw + (typeof v === 'string' ? v : '');
		}, '');
	}
	if (tree.type === 'ArrayExpression') {
		const values = tree.elements.map((treeNode) => {
			if (treeNode === null) {
				return '';
			}
			if (treeNode.type === 'SpreadElement') {
				return normalizeClassWalker(treeNode.argument, stack);
			}
			return normalizeClassWalker(treeNode, stack);
		});
		if (values.some((x) => x === null)) {
			return null;
		}
		return values.join(' ');
	}
	if (tree.type === 'ObjectExpression') {
		const values = tree.properties.map((treeNode) => {
			if (treeNode.type === 'SpreadElement') {
				return normalizeClassWalker(treeNode.argument, stack);
			}
			let x = treeNode.value;
			let inveted = false;
			while (x.type === 'UnaryExpression' && x.operator === '!') {
				x = x.argument;
				inveted = !inveted;
			}
			if (x.type === 'Literal') {
				if (inveted === !x.value) {
					return treeNode.key.type === 'Identifier'
						? treeNode.computed
							? null
							: treeNode.key.name
						: treeNode.key.type === 'Literal'
							? treeNode.key.value
							: '';
				}
				return '';
			}
			if (x.type === 'Identifier') {
				if (inveted !== isFalsyIdentifier(x)) {
					return '';
				}
				return null;
			}
			return null;
		});
		if (values.some((x) => x === null)) {
			return null;
		}
		return values.join(' ');
	}
	if (
		tree.type !== 'CallExpression' &&
		tree.type !== 'ChainExpression' &&
		tree.type !== 'ConditionalExpression' &&
		tree.type !== 'LogicalExpression' &&
		tree.type !== 'MemberExpression'
	) {
		console.error(stack ? `Unexpected node type: ${tree.type} (in ${stack})` : `Unexpected node type: ${tree.type}`);
	}
	return null;
}

export function normalizeClass(tree: ESTree.Node, stack?: string): string | null {
	const walked = normalizeClassWalker(tree, stack);
	return walked && walked.replaceAll(/^\s+|\s+(?=\s)|\s+$/g, '');
}

function getPropertyName(node: ESTree.Node, computed: boolean): string | null {
	if (node.type === 'Identifier') {
		return computed ? null : node.name;
	}
	if (node.type === 'Literal' && typeof node.value === 'string') {
		return node.value;
	}
	return null;
}

function getMemberPropertyName(node: ESTree.MemberExpression['property'], computed: boolean): string | null {
	if (node.type === 'Identifier') {
		return computed ? null : node.name;
	}
	if (node.type === 'Literal' && typeof node.value === 'string') {
		return node.value;
	}
	return null;
}

function findVariableDeclaration(program: ESTree.Program, name: string): ESTree.VariableDeclaration | null {
	return program.body.find((x) => {
		if (x.type !== 'VariableDeclaration') {
			return false;
		}
		const declarator = x.declarations[0];
		if (x.declarations.length !== 1 || declarator === undefined) {
			return false;
		}
		if (declarator.id.type !== 'Identifier') {
			return false;
		}
		return declarator.id.name === name;
	}) as ESTree.VariableDeclaration | null;
}

function resolveObjectExpression(program: ESTree.Program, tree: ESTree.Expression): ESTree.ObjectExpression | null {
	if (tree.type === 'ObjectExpression') {
		return tree;
	}
	if (tree.type !== 'Identifier') {
		return null;
	}
	const init = findVariableDeclaration(program, tree.name)?.declarations[0]?.init;
	return init?.type === 'ObjectExpression' ? init : null;
}

function resolveComponentOptions(program: ESTree.Program, tree: ESTree.Expression): ESTree.ObjectExpression | null {
	const target =
		tree.type === 'Identifier' ? (findVariableDeclaration(program, tree.name)?.declarations[0]?.init ?? null) : tree;
	if (target?.type === 'ObjectExpression') {
		return target;
	}
	if (target?.type !== 'CallExpression') {
		return null;
	}
	const [options] = target.arguments;
	if (target.arguments.length !== 1 || options?.type !== 'ObjectExpression') {
		return null;
	}
	return options;
}

function resolveModuleTree(program: ESTree.Program, tree: ESTree.Expression): Map<string, string> | null {
	const objectExpression = resolveObjectExpression(program, tree);
	if (objectExpression === null) {
		return null;
	}
	return new Map(
		objectExpression.properties.flatMap((property) => {
			if (property.type !== 'Property') {
				return [];
			}
			const actualKey = getPropertyName(property.key, property.computed);
			if (actualKey === null) {
				return [];
			}
			if (property.value.type === 'Literal') {
				return typeof property.value.value === 'string' ? [[actualKey, property.value.value]] : [];
			}
			if (property.value.type === 'Identifier') {
				const init = findVariableDeclaration(program, property.value.name)?.declarations[0]?.init;
				if (init?.type !== 'Literal') {
					return [];
				}
				return typeof init.value === 'string' ? [[actualKey, init.value]] : [];
			}
			return [];
		}),
	);
}

function resolveModuleForest(
	program: ESTree.Program,
	tree: ESTree.Expression,
): Map<string, Map<string, string>> | null {
	const objectExpression = resolveObjectExpression(program, tree);
	if (objectExpression === null) {
		return null;
	}
	return new Map(
		objectExpression.properties.flatMap((property) => {
			if (property.type !== 'Property') {
				return [];
			}
			const actualKey = getPropertyName(property.key, property.computed);
			if (actualKey === null) {
				return [];
			}
			const moduleTree = resolveModuleTree(program, property.value);
			return moduleTree === null ? [] : [[actualKey, moduleTree]];
		}),
	);
}

function findRenderArrow(
	options: ESTree.ObjectExpression,
): Extract<ESTree.Node, { type: 'ArrowFunctionExpression' }> | null {
	const setup = options.properties.find((x) => {
		if (x.type !== 'Property') {
			return false;
		}
		return getPropertyName(x.key, x.computed) === 'setup';
	}) as Extract<ESTree.Node, { type: 'Property' }> | undefined;
	if (setup?.value.type !== 'FunctionExpression' && setup?.value.type !== 'ArrowFunctionExpression') {
		return null;
	}
	if (setup.value.body == null) {
		return null;
	}
	if (setup.value.body.type !== 'BlockStatement') {
		return null;
	}
	const render = setup.value.body.body.find((x) => x.type === 'ReturnStatement');
	if (render?.type !== 'ReturnStatement') {
		return null;
	}
	return render.argument?.type === 'ArrowFunctionExpression' ? render.argument : null;
}

function isCssModuleAccess(
	node: ESTree.Node,
	ctxName: string,
	key: string,
): node is Extract<ESTree.Node, { type: 'MemberExpression' }> {
	if (node.type !== 'MemberExpression') {
		return false;
	}
	if (node.object.type !== 'MemberExpression') {
		return false;
	}
	if (node.object.object.type !== 'Identifier') {
		return false;
	}
	if (node.object.object.name !== ctxName) {
		return false;
	}
	return getMemberPropertyName(node.object.property, node.object.computed) === key;
}

function isCssModuleReference(
	node: ESTree.Node,
	ctxName: string,
	key: string,
): node is Extract<ESTree.Node, { type: 'MemberExpression' }> {
	if (!isCssModuleAccess(node, ctxName, key)) {
		return false;
	}
	return getMemberPropertyName(node.property, node.computed) !== null;
}

function isClassProperty(node: ESTree.Node | null): node is Extract<ESTree.Node, { type: 'Property' }> {
	return node?.type === 'Property' && getPropertyName(node.key, node.computed) === 'class';
}

export function unwindCssModuleClassName(ast: ESTree.Node, magicString: RolldownMagicString): void {
	if (ast.type !== 'Program') {
		return;
	}
	// 対象は _export_sfc(...) を受けるトップレベルの変数宣言だけなので、木全体はたどらない。
	// コンポーネント識別子の付け替えはチャンク内の全識別子を見る。コンポーネントごとに木をたどり直すと
	// コンポーネント数 × チャンクの大きさになるので、名前ごとの出現位置をチャンクにつき 1 度だけ集める。
	let identifiersByName: Map<string, IdentifierNode[]> | null = null;
	const findIdentifiers = (name: string): IdentifierNode[] => {
		if (identifiersByName === null) {
			const index = new Map<string, IdentifierNode[]>();
			walk(ast, {
				enter(childNode: ESTree.Node) {
					if (childNode.type !== 'Identifier') {
						return;
					}
					const list = index.get(childNode.name);
					if (list === undefined) {
						index.set(childNode.name, [childNode]);
					} else {
						list.push(childNode);
					}
				},
			});
			identifiersByName = index;
		}
		return identifiersByName.get(name) ?? [];
	};
	for (const node of ast.body) {
		unwindComponentDeclaration(ast, node, magicString, findIdentifiers);
	}
}

function unwindComponentDeclaration(
	ast: ESTree.Program,
	node: ESTree.Program['body'][number],
	magicString: RolldownMagicString,
	findIdentifiers: (name: string) => IdentifierNode[],
): void {
	if (node.type !== 'VariableDeclaration') {
		return;
	}
	const declarator = node.declarations[0];
	if (node.declarations.length !== 1 || declarator === undefined) {
		return;
	}
	if (declarator.id.type !== 'Identifier') {
		return;
	}
	const name = declarator.id.name;
	const init = declarator.init;
	if (init?.type !== 'CallExpression') {
		return;
	}
	// _export_sfc(component, [[key, value], ...]) の形
	const [componentNode, sfcEntries] = init.arguments;
	if (init.arguments.length !== 2 || componentNode === undefined || sfcEntries === undefined) {
		return;
	}
	if (
		componentNode.type !== 'Identifier' &&
		componentNode.type !== 'CallExpression' &&
		componentNode.type !== 'ObjectExpression'
	) {
		return;
	}
	if (sfcEntries.type !== 'ArrayExpression') {
		return;
	}
	if (sfcEntries.elements.length === 0) {
		return;
	}
	const cssModulesEntry = sfcEntries.elements.find((x) => {
		if (x?.type !== 'ArrayExpression') {
			return false;
		}
		if (x.elements.length !== 2) {
			return false;
		}
		if (x.elements[0]?.type !== 'Literal') {
			return false;
		}
		if (x.elements[0].value !== '__cssModules') {
			return false;
		}
		return true;
	}) as ESTree.ArrayExpression | undefined;
	const __cssModulesIndex = sfcEntries.elements.indexOf(cssModulesEntry ?? null);
	if (cssModulesEntry === undefined || __cssModulesIndex === -1) {
		return;
	}
	const cssModuleForest = cssModulesEntry.elements[1];
	if (cssModuleForest?.type !== 'Identifier' && cssModuleForest?.type !== 'ObjectExpression') {
		return;
	}
	const moduleForest = resolveModuleForest(ast, cssModuleForest);
	if (moduleForest === null) {
		return;
	}
	const options = resolveComponentOptions(ast, componentNode);
	if (options === null) {
		return;
	}
	const render = findRenderArrow(options);
	if (render === null) {
		return;
	}
	if (render.params.length !== 2) {
		return;
	}
	const ctx = render.params[0];
	if (ctx?.type !== 'Identifier') {
		return;
	}
	const ctxName = ctx.name;
	for (const [key, moduleTree] of moduleForest) {
		walk(render.body, {
			enter(childNode: ESTree.Node) {
				if (!isCssModuleReference(childNode, ctxName, key)) {
					return;
				}
				const actualKey = getMemberPropertyName(childNode.property, childNode.computed);
				if (actualKey === null) {
					return;
				}
				const actualValue = moduleTree.get(actualKey);
				if (actualValue === undefined) {
					return;
				}
				magicString.overwrite(childNode.start, childNode.end, JSON.stringify(actualValue));
				this.replace({
					type: 'Literal',
					value: actualValue,
					raw: JSON.stringify(actualValue),
					start: childNode.start,
					end: childNode.end,
				});
			},
		});
		walk(render.body, {
			enter(childNode: ESTree.Node) {
				if (!isCssModuleReference(childNode, ctxName, key)) {
					return;
				}
				const actualKey = getMemberPropertyName(childNode.property, childNode.computed);
				if (actualKey === null) {
					return;
				}
				console.error(`Undefined style detected: ${key}.${actualKey} (in ${name})`);
				magicString.overwrite(childNode.start, childNode.end, 'undefined');
			},
		});
		walk(render.body, {
			enter(childNode: ESTree.Node, childParent: ESTree.Node | null) {
				if (childNode.type !== 'CallExpression') {
					return;
				}
				const [classArgument] = childNode.arguments;
				if (childNode.arguments.length !== 1 || classArgument === undefined) {
					return;
				}
				if (
					childNode.callee.type === 'Identifier' &&
					childNode.callee.name !== 'normalizeClass' &&
					!isClassProperty(childParent)
				) {
					return;
				}
				if (childNode.callee.type !== 'Identifier' && !isClassProperty(childParent)) {
					return;
				}
				const normalized = normalizeClass(classArgument, name);
				if (normalized === null) {
					return;
				}
				magicString.overwrite(childNode.start, childNode.end, JSON.stringify(normalized));
			},
		});
	}
	const hasRemainingCssModuleReference = Array.from(moduleForest.keys()).some((key) => {
		let found = false;
		walk(render.body, {
			enter(childNode: ESTree.Node) {
				if (!isCssModuleAccess(childNode, ctxName, key)) {
					return;
				}
				found = true;
				this.skip();
			},
		});
		return found;
	});
	if (hasRemainingCssModuleReference) {
		return;
	}
	if (sfcEntries.elements.length === 1) {
		if (componentNode.type === 'Identifier') {
			for (const identifier of findIdentifiers(componentNode.name)) {
				magicString.overwrite(identifier.start, identifier.end, name);
			}
			magicString.remove(node.start, node.end);
		} else {
			const removeStart = cssModulesEntry.start;
			const removeEnd = sfcEntries.end - 1;
			magicString.remove(removeStart, removeEnd);
		}
		/* この削除処理は、コンポーネント識別子がモジュール内で一意であり、
		 * _export_sfc の第2引数が空配列なら副作用を持たない場合に成立する。
		 */
	} else {
		const nextElement = sfcEntries.elements[__cssModulesIndex + 1];
		const removeStart = cssModulesEntry.start;
		const removeEnd = nextElement ? nextElement.start : sfcEntries.end - 1;
		magicString.remove(removeStart, removeEnd);
	}
}

/** CSS Modules を持つコンポーネントのクラス名を、実行時の参照から文字列へ展開する。 */
export const unwindCssModules: ChunkRewrite = {
	marker: '__cssModules',
	apply: unwindCssModuleClassName,
};
