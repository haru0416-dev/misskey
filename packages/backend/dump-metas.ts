import { endpointMetas } from './src/server/api/endpoint-metas.js';

const out: Record<string, unknown> = {};
for (const [name, ep] of Object.entries(endpointMetas as Record<string, any>)) {
	const m = ep?.meta ?? {};
	out[name] = {
		requireCredential: m.requireCredential ?? false,
		requireModerator: m.requireModerator ?? false,
		requireAdmin: m.requireAdmin ?? false,
		secure: m.secure ?? false,
		kind: m.kind ?? null,
		prohibitMoved: m.prohibitMoved ?? false,
		limit: m.limit ?? null,
		requireFile: m.requireFile ?? false,
		allowGet: m.allowGet ?? false,
		requiredRolePolicy: m.requiredRolePolicy ?? null,
	};
}
console.log(JSON.stringify(out, null, '\t'));
