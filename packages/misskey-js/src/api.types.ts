import { Endpoints as Gen } from './autogen/endpoint.js';
import { UserDetailed } from './autogen/models.js';
import {
	AdminRolesCreateRequest,
	AdminRolesCreateResponse,
	EmptyRequest,
	EmptyResponse,
	I2faRegisterKeyRequest,
	I2faKeyDoneResponse,
	UsersShowRequest,
} from './autogen/entities.js';
import {
	PartialRolePolicyOverride,
	SigninFlowRequest,
	SigninFlowResponse,
	SigninWithPasskeyInitResponse,
	SigninWithPasskeyRequest,
	SigninWithPasskeyResponse,
	SignupPendingRequest,
	SignupPendingResponse,
	SignupRequest,
	SignupResponse,
	I2faRegisterKeyResponse,
	I2faKeyDoneRequest,
} from './entities.js';

type Overwrite<T, U extends { [Key in keyof T]?: unknown }> = Omit<
	T,
	keyof U
> & U;

type SwitchCase<Condition = unknown, Result = unknown> = {
	$switch: {
		$cases: [Condition, Result][],
		$default: Result;
	};
};

type CaseCondition<Cases> = Cases extends [infer Condition, unknown] ? Condition : never;
type MatchingCaseResult<Cases, P> = Cases extends [infer Condition, infer Result]
	? Extract<P, Condition> extends never ? never : Result
	: never;

export type SwitchCaseResponseType<E extends keyof Endpoints, P extends Endpoints[E]['req']> = Endpoints[E]['res'] extends SwitchCase
	? [P] extends [never]
		? Endpoints[E]['res']['$switch']['$default']
		: MatchingCaseResult<Endpoints[E]['res']['$switch']['$cases'][number], P>
		| ([Exclude<P, CaseCondition<Endpoints[E]['res']['$switch']['$cases'][number]>>] extends [never]
			? never
			: Endpoints[E]['res']['$switch']['$default'])
	: Endpoints[E]['res'];

export type Endpoints = Overwrite<
	Gen,
	{
		'users/show': {
			req: UsersShowRequest;
			res: {
				$switch: {
					$cases: [[
						{
							userIds: string[];
						}, UserDetailed[],
					]];
					$default: UserDetailed;
				};
			};
		},
		// api.jsonには載せないものなのでここで定義
		'signup': {
			req: SignupRequest;
			res: SignupResponse;
		},
		// api.jsonには載せないものなのでここで定義
		'signup-pending': {
			req: SignupPendingRequest;
			res: SignupPendingResponse;
		},
		// api.jsonには載せないものなのでここで定義
		'signin-flow': {
			req: SigninFlowRequest;
			res: SigninFlowResponse;
		},
		'signin-with-passkey': {
			req: SigninWithPasskeyRequest;
			reqOptional: true;
			res: {
				$switch: {
					$cases: [
						[
							{
								credential: NonNullable<SigninWithPasskeyRequest['credential']>;
								context: string;
							},
							SigninWithPasskeyResponse,
						],
					];
					$default: SigninWithPasskeyInitResponse;
				},
			},
		},
		'i/2fa/register-key': {
			req: I2faRegisterKeyRequest;
			res: I2faRegisterKeyResponse;
		},
		'i/2fa/key-done': {
			req: I2faKeyDoneRequest;
			res: I2faKeyDoneResponse;
		},
		'admin/roles/create': {
			req: Overwrite<AdminRolesCreateRequest, { policies: PartialRolePolicyOverride }>;
			res: AdminRolesCreateResponse;
		},
		'clear-browser-cache': {
			req: EmptyRequest;
			res: EmptyResponse;
			reqOptional: true;
		},
	}
>;
