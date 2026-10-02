import assert from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import type {
	OpenAPI3,
	OperationObject,
	PathItemObject,
	RequestBodyObject,
	ResponseObject,
	ResponsesObject,
} from 'openapi-typescript';
import ts from 'typescript';
import { removeNeverPropertiesFromAST } from './ast-transformer.js';

function toPascalCase(term: string): string {
	return term
		.replace(/^([A-Z])/, (m) => m.toLowerCase())
		.replaceAll(/[_-]([a-z0-9])/g, (m) => m[1]!.toUpperCase())
		.replace(/^([a-z])/, (m) => m.toUpperCase());
}

async function generateBaseTypes(openApiJsonPath: string, typeFileName: string) {
	const lines: string[] = [];

	// POST の operationId からメソッド接頭辞を除き、GET の定義は生成対象から外す。
	const openApi = JSON.parse(await readFile(openApiJsonPath, 'utf8')) as OpenAPI3;
	for (const [key, item] of Object.entries(openApi.paths!)) {
		assert('post' in item);
		openApi.paths![key] = {
			post: {
				...item.post,
				operationId: ((item as PathItemObject).post as OperationObject).operationId!.replaceAll('post___', ''),
			},
		};
	}

	const tsNullNode = ts.factory.createLiteralTypeNode(ts.factory.createNull());
	const tsBlobNode = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Blob'));

	const generatedTypesAst = await openapiTS(openApi, {
		exportType: true,
		transform(schemaObject) {
			if ('format' in schemaObject && schemaObject.format === 'binary') {
				if (schemaObject.nullable) {
					return ts.factory.createUnionTypeNode([tsBlobNode, tsNullNode]);
				}
				return tsBlobNode;
			}
		},
	});

	const filteredAst = removeNeverPropertiesFromAST(generatedTypesAst);

	lines.push(astToString(filteredAst));

	lines.push('');

	await writeFile(typeFileName, lines.join('\n'));
}

async function generateSchemaEntities(openApiDocs: OpenAPI3, typeFileName: string, outputPath: string) {
	if (!openApiDocs.components?.schemas) {
		return;
	}

	const schemas = openApiDocs.components.schemas;
	const schemaNames = Object.keys(schemas);
	const typeAliasLines: string[] = [];

	typeAliasLines.push(`import type { components } from '${toImportPath(typeFileName)}';`);
	typeAliasLines.push(...schemaNames.map((it) => `export type ${it} = components['schemas']['${it}'];`));
	typeAliasLines.push('');

	await writeFile(outputPath, typeAliasLines.join('\n'));
}

async function generateEndpoints(
	openApiDocs: OpenAPI3,
	typeFileName: string,
	entitiesOutputPath: string,
	endpointOutputPath: string,
) {
	const endpoints: Endpoint[] = [];
	const endpointReqMediaTypes: EndpointReqMediaType[] = [];
	const endpointReqMediaTypesSet = new Set<string>();

	// misskey-jsはPOSTだけを送信するため、POSTの定義だけを生成する。
	const paths = openApiDocs.paths ?? {};
	// 自前の api.json は path にも operation にも $ref を使わない。
	const postPathItems = Object.entries(paths).flatMap(([it, item]) =>
		item == null || '$ref' in item || item.post == null || '$ref' in item.post
			? []
			: [{ _path_: it.replace(/^\//, ''), ...item.post }],
	);

	for (const operation of postPathItems) {
		const path = operation._path_;
		const operationId = operation.operationId!.replaceAll('get___', '').replaceAll('post___', '');
		const endpoint = new Endpoint(path);
		endpoint.errorCodes = collectErrorCodes(operation.responses);
		endpoints.push(endpoint);

		if (isRequestBodyObject(operation.requestBody)) {
			const reqContent = operation.requestBody.content;
			const supportMediaTypes = Object.keys(reqContent);
			if (supportMediaTypes.length > 0) {
				// 複数のメディアタイプに対応する選択規則がないため、先頭の1件を採用する。
				const req = new OperationTypeAlias(
					operationId,
					path,
					supportMediaTypes[0],
					OperationsAliasType.REQUEST,
					operation.requestBody.required !== true,
				);
				endpoint.request = req;

				const reqType = new EndpointReqMediaType(path, req);
				if (reqType.getMediaType() !== 'application/json') {
					endpointReqMediaTypesSet.add(reqType.getMediaType());
					endpointReqMediaTypes.push(reqType);
				}
			}
		}

		if (operation.responses && isResponseObject(operation.responses['200']) && operation.responses['200'].content) {
			const resContent = operation.responses['200'].content;
			const supportMediaTypes = Object.keys(resContent);
			if (supportMediaTypes.length > 0) {
				// 複数のメディアタイプに対応する選択規則がないため、先頭の1件を採用する。
				endpoint.response = new OperationTypeAlias(
					operationId,
					path,
					supportMediaTypes[0],
					OperationsAliasType.RESPONSE,
					false,
					isResponseObject(operation.responses['204']),
				);
			}
		}
	}

	const entitiesOutputLine: string[] = [];

	entitiesOutputLine.push(`import type { operations } from '${toImportPath(typeFileName)}';`);
	entitiesOutputLine.push('');

	entitiesOutputLine.push(new EmptyTypeAlias(OperationsAliasType.REQUEST).toLine());
	entitiesOutputLine.push(new EmptyTypeAlias(OperationsAliasType.RESPONSE).toLine());
	entitiesOutputLine.push('');

	const entities = endpoints.flatMap((it) => [it.request, it.response]).filter(filterUndefined);
	entitiesOutputLine.push(...entities.map((it) => it.toLine()));
	entitiesOutputLine.push('');

	await writeFile(entitiesOutputPath, entitiesOutputLine.join('\n'));

	const endpointOutputLine: string[] = [];

	endpointOutputLine.push('import type {');
	endpointOutputLine.push(...[emptyRequest, emptyResponse, ...entities].map((it) => '\t' + it.generateName() + ','));
	endpointOutputLine.push(`} from '${toImportPath(entitiesOutputPath)}';`);
	endpointOutputLine.push('');

	endpointOutputLine.push('export type Endpoints = {');
	endpointOutputLine.push(...endpoints.map((it) => '\t' + it.toLine()));
	endpointOutputLine.push('};');
	endpointOutputLine.push('');

	function generateEndpointReqMediaTypesType() {
		return `{ [K in keyof Endpoints]?: ${[...endpointReqMediaTypesSet].map((t) => `'${t}'`).join(' | ')}; }`;
	}

	endpointOutputLine.push(`/**
	 * Request Content-Type defaults to application/json for endpoints not listed here.
	 */`);
	endpointOutputLine.push('export const endpointReqTypes = {');

	endpointOutputLine.push(...endpointReqMediaTypes.map((it) => '\t' + it.toLine()));

	endpointOutputLine.push(`} as const satisfies ${generateEndpointReqMediaTypesType()};`);
	endpointOutputLine.push('');

	await writeFile(endpointOutputPath, endpointOutputLine.join('\n'));
}

function isRequestBodyObject(value: unknown): value is RequestBodyObject {
	if (!value) {
		return false;
	}

	const { content } = value as Record<keyof RequestBodyObject, unknown>;
	return content !== undefined;
}

function isResponseObject(value: unknown): value is ResponseObject {
	if (!value) {
		return false;
	}

	const { description } = value as Record<keyof ResponseObject, unknown>;
	return description !== undefined;
}

// 仕様書のエラー例 (examples.*.value.error.code) から、そのエンドポイントが返しうるエラーコードを集める。
// 例に無いコードは型に現れないため、サーバー側で例を省くと、クライアントの型がエラーコードを網羅できなくなる。
function collectErrorCodes(responses: ResponsesObject | undefined): string[] {
	const codes = new Set<string>();
	for (const [status, response] of Object.entries(responses ?? {})) {
		if (status.startsWith('2') || !isResponseObject(response)) continue;
		for (const media of Object.values(response.content ?? {})) {
			for (const example of Object.values(media.examples ?? {})) {
				const value: unknown = 'value' in example ? example.value : undefined;
				if (value == null || typeof value !== 'object' || !('error' in value)) continue;
				const error: unknown = value.error;
				if (error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
					codes.add(error.code);
				}
			}
		}
	}
	return [...codes].toSorted();
}

function filterUndefined<T>(item: T): item is Exclude<T, undefined> {
	return item !== undefined;
}

function toImportPath(fileName: string, fromPath = '/built/autogen', toPath = ''): string {
	return fileName.replace(fromPath, toPath).replace('.ts', '.js');
}

enum OperationsAliasType {
	REQUEST = 'Request',
	RESPONSE = 'Response',
}

interface IOperationTypeAlias {
	readonly type: OperationsAliasType;
	readonly requestBodyOptional: boolean;

	generateName(): string;

	toLine(): string;
}

class OperationTypeAlias implements IOperationTypeAlias {
	public readonly operationId: string;
	public readonly path: string;
	public readonly mediaType: string;
	public readonly type: OperationsAliasType;
	public readonly requestBodyOptional: boolean;
	public readonly responseCanBeNoContent: boolean;

	constructor(
		operationId: string,
		path: string,
		mediaType: string,
		type: OperationsAliasType,
		requestBodyOptional = false,
		responseCanBeNoContent = false,
	) {
		this.operationId = operationId;
		this.path = path;
		this.mediaType = mediaType;
		this.type = type;
		this.requestBodyOptional = requestBodyOptional;
		this.responseCanBeNoContent = responseCanBeNoContent;
	}

	generateName(): string {
		const nameBase = this.path.replaceAll('/', '-');
		return toPascalCase(nameBase + this.type);
	}

	toLine(): string {
		const name = this.generateName();
		if (this.type === OperationsAliasType.RESPONSE) {
			return `export type ${name} = operations['${this.operationId}']['responses']['200']['content']['${this.mediaType}']${this.responseCanBeNoContent ? ' | null' : ''};`;
		}

		const requestBody = `NonNullable<operations['${this.operationId}']['requestBody']>`;
		return `export type ${name} = ${requestBody}['content']['${this.mediaType}'];`;
	}
}

class EmptyTypeAlias implements IOperationTypeAlias {
	readonly type: OperationsAliasType;
	readonly requestBodyOptional: boolean;

	constructor(type: OperationsAliasType) {
		this.type = type;
		this.requestBodyOptional = type === OperationsAliasType.REQUEST;
	}

	generateName(): string {
		return 'Empty' + this.type;
	}

	toLine(): string {
		const name = this.generateName();
		return this.type === OperationsAliasType.REQUEST
			? `export type ${name} = Record<string, unknown>;`
			: `export type ${name} = null;`;
	}
}

const emptyRequest = new EmptyTypeAlias(OperationsAliasType.REQUEST);
const emptyResponse = new EmptyTypeAlias(OperationsAliasType.RESPONSE);

class Endpoint {
	public readonly path: string;
	public request?: IOperationTypeAlias;
	public response?: IOperationTypeAlias;
	public errorCodes: string[] = [];

	constructor(path: string) {
		this.path = path;
	}

	toLine(): string {
		const reqName = this.request?.generateName() ?? emptyRequest.generateName();
		const resName = this.response?.generateName() ?? emptyResponse.generateName();
		const reqOptional = this.request?.requestBodyOptional ?? true;

		const err = this.errorCodes.length > 0 ? this.errorCodes.map((code) => `'${code}'`).join(' | ') : 'never';

		return `'${this.path}': { req: ${reqName}; res: ${resName}; err: ${err}${reqOptional ? '; reqOptional: true' : ''} };`;
	}
}

class EndpointReqMediaType {
	public readonly path: string;
	public readonly mediaType: string;

	constructor(path: string, request: OperationTypeAlias, mediaType?: undefined);
	constructor(path: string, request: undefined, mediaType: string);
	constructor(path: string, request: OperationTypeAlias | undefined, mediaType?: string) {
		this.path = path;
		this.mediaType = mediaType ?? request?.mediaType ?? 'application/json';
	}

	getMediaType(): string {
		return this.mediaType;
	}

	toLine(): string {
		return `'${this.path}': '${this.mediaType}',`;
	}
}

async function main() {
	const generatePath = './built/autogen';
	// update-autogen-code はこのフォルダを丸ごと src/autogen へ写すので、生成しなくなったファイルを残さない。
	await rm(generatePath, { recursive: true, force: true });
	await mkdir(generatePath, { recursive: true });

	const openApiJsonPath = './api.json';
	const openApiDocs = JSON.parse(await readFile(openApiJsonPath, 'utf8')) as OpenAPI3;

	const typeFileName = './built/autogen/types.ts';
	await generateBaseTypes(openApiJsonPath, typeFileName);

	const modelFileName = `${generatePath}/models.ts`;
	await generateSchemaEntities(openApiDocs, typeFileName, modelFileName);

	const entitiesFileName = `${generatePath}/entities.ts`;
	const endpointFileName = `${generatePath}/endpoint.ts`;
	await generateEndpoints(openApiDocs, typeFileName, entitiesFileName, endpointFileName);
}

main();
