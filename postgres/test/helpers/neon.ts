// NEON_HTTP_URL can point at Neon's cloud or at the local proxy from compose/neon.yml (Neon's own proxy
// over a local Postgres, reached as host db.localtest.me): `bash compose/dockers.sh up neon`, then
//   NEON_HTTP_URL='postgres://postgres:postgres@db.localtest.me:54327/main' bun run test:neon-http
// The local proxy serves plain HTTP on port 4444 (NEON_LOCAL_PROXY_PORT when shifted), so the client
// needs its SQL endpoint spelled out.
const LOCAL_NEON_HOST = /@db\.localtest\.me[:/]/;
const localEndpoint = `http://db.localtest.me:${process.env.NEON_LOCAL_PROXY_PORT ?? '4444'}/sql`;

/** The neon-http config for a NEON_HTTP_URL, plus the local proxy's endpoint when it names that host. */
export const neonHttpConfig = <T extends object>(
	url: string,
	extra?: T,
): T & { url: string; fetchEndpoint?: string } => ({
	...(extra as T),
	url,
	...(LOCAL_NEON_HOST.test(url) ? { fetchEndpoint: localEndpoint } : {}),
});
