import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Creates or updates the `motoswipe` stack in a local Portainer from
 * `docker-compose.portainer.yml`, with the stack variables taken from `.env`.
 *
 *   PORTAINER_API_KEY=ptr_... npx tsx scripts/portainer-deploy.ts
 *
 * Optional: PORTAINER_URL (default http://localhost:9000), PORTAINER_STACK
 * (default motoswipe), PORTAINER_ENDPOINT_ID (default: the first Docker
 * endpoint). Build the image first with `docker compose build`; on an update
 * the stack is re-pulled and recreated so the new image is picked up.
 *
 * Deliberately a plain script over the REST API: no Portainer SDK, and the
 * API key never touches the repository — it comes from the environment only.
 */

const ROOT = resolve(import.meta.dirname, '..');
const BASE = (process.env.PORTAINER_URL ?? 'http://localhost:9000').replace(/\/+$/, '');
const KEY = process.env.PORTAINER_API_KEY;
const STACK = process.env.PORTAINER_STACK ?? 'motoswipe';

if (!KEY) {
	console.error('PORTAINER_API_KEY is not set (create one under My account → Access tokens).');
	process.exit(1);
}

/** Variables the compose file actually references, in .env order. */
const WANTED = new Set([
	'MOTOSWIPE_IMAGE',
	'POSTGRES_USER',
	'POSTGRES_PASSWORD',
	'POSTGRES_DB',
	'POSTGRES_PORT',
	'APP_BIND',
	'APP_PORT',
	'SESSION_SECRET',
	'SESSION_TTL_DAYS',
	'ORIGIN',
	'TRUST_PROXY_HOPS',
	'ADDRESS_HEADER',
	'ALLOW_REGISTRATION',
	'REGISTRATIONS_PER_HOUR',
	'MAIL_PROVIDER',
	'RESEND_API_KEY',
	'MAIL_FROM',
	'DEMOS_PER_HOUR',
	'GUEST_RETENTION_DAYS'
]);

function readEnv(): { name: string; value: string }[] {
	const out: { name: string; value: string }[] = [];
	for (const raw of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq < 0) continue;
		const name = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (WANTED.has(name) && value !== '') out.push({ name, value });
	}
	return out;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${BASE}/api${path}`, {
		...init,
		headers: { 'X-API-Key': KEY!, 'content-type': 'application/json', ...(init.headers ?? {}) }
	});
	const text = await response.text();
	if (!response.ok)
		throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${text}`);
	return (text ? JSON.parse(text) : null) as T;
}

interface Endpoint {
	Id: number;
	Name: string;
	Type: number;
}
interface Stack {
	Id: number;
	Name: string;
	EndpointId: number;
}

const endpoints = await api<Endpoint[]>('/endpoints');
const endpointId = process.env.PORTAINER_ENDPOINT_ID
	? Number(process.env.PORTAINER_ENDPOINT_ID)
	: (endpoints.find((e) => e.Type === 1 || e.Type === 2)?.Id ?? endpoints[0]?.Id);
if (!endpointId) throw new Error('No Portainer endpoint found.');

const stackFileContent = readFileSync(resolve(ROOT, 'docker-compose.portainer.yml'), 'utf8');
const env = readEnv();
const missing = ['POSTGRES_PASSWORD', 'SESSION_SECRET', 'ORIGIN'].filter(
	(n) => !env.some((e) => e.name === n)
);
if (missing.length) throw new Error(`.env is missing ${missing.join(', ')}`);

const existing = (await api<Stack[]>('/stacks')).find((s) => s.Name === STACK);

if (existing) {
	await api(`/stacks/${existing.Id}?endpointId=${existing.EndpointId}`, {
		method: 'PUT',
		body: JSON.stringify({ stackFileContent, env, prune: false, pullImage: false })
	});
	console.log(`Updated stack "${STACK}" (id ${existing.Id}) on endpoint ${existing.EndpointId}.`);
} else {
	const created = await api<Stack>(`/stacks/create/standalone/string?endpointId=${endpointId}`, {
		method: 'POST',
		body: JSON.stringify({ name: STACK, stackFileContent, env, fromAppTemplate: false })
	});
	console.log(`Created stack "${STACK}" (id ${created.Id}) on endpoint ${endpointId}.`);
}
console.log(`Variables passed: ${env.map((e) => e.name).join(', ')}`);
