// Connection-string (postgres:// | postgresql://) parsing. Uses the WHATWG URL (universal — no node dep)
// so it works on every runtime. Turns a libpq-style URI into a partial ConnectConfig; `resolveUrl` then
// layers the parsed values UNDER any explicit config fields (explicit always wins) and strips `url`.
import type { ConnectConfig } from './types.ts'

// Mask the password in a connection string so it can't leak into error messages / logs.
const redactUrl = (url: string): string => url.replace(/(:\/\/[^:/?#@\s]*:)[^@/?#\s]*(@)/, '$1***$2')

// decodeURIComponent, but a malformed percent-escape (e.g. a literal "%" in a password) becomes a
// helpful error instead of the opaque "URI malformed" — this is the "needs re-encoding" case.
function decodePart(s: string, what: string, url: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    throw new Error(`minipg: the ${what} in connection string ${redactUrl(url)} has an invalid percent-escape — write a literal "%" as "%25" and percent-encode other reserved characters`)
  }
}

/** Parse `postgres://user:pass@host:port/db?sslmode=…` into a partial config. Supports the userinfo,
 *  host/port, database, and the `sslmode`/`application_name`/`connect_timeout` params, plus a unix-socket
 *  `?host=/path`. Percent-encoded userinfo/database are decoded; IPv6 brackets are stripped. */
export function parseConnectionString(url: string): Partial<ConnectConfig> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    if (!/^postgres(?:ql)?:\/\//i.test(url.trim())) {
      throw new Error(`minipg: invalid connection string — it must start with "postgres://" or "postgresql://" (received: ${redactUrl(url)})`)
    }
    // scheme is fine but the rest is malformed — almost always a bad port or an un-encoded credential char
    throw new Error(`minipg: could not parse connection string ${redactUrl(url)} — check the host/port, and percent-encode any reserved characters in the username/password ("@"→"%40", ":"→"%3A", "/"→"%2F")`)
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    throw new Error(`minipg: unsupported connection string scheme "${u.protocol}" — it must start with "postgres://" or "postgresql://" (received: ${redactUrl(url)})`)
  }
  const out: Partial<ConnectConfig> = {}
  const q = u.searchParams
  if (u.username) out.user = decodePart(u.username, 'username', url)
  if (u.password) out.password = decodePart(u.password, 'password', url)
  const unix = q.get('host') // ?host=/var/run/postgresql -> unix socket (takes precedence over any TCP host)
  if (unix && unix.startsWith('/')) out.path = unix
  else if (u.hostname) out.host = u.hostname.replace(/^\[|\]$/g, '') // strip IPv6 [..] for net.connect
  if (u.port) out.port = Number(u.port)
  const db = u.pathname.replace(/^\//, '')
  if (db) out.database = decodePart(db, 'database', url)
  const appName = q.get('application_name'); if (appName) out.applicationName = appName
  const ct = q.get('connect_timeout'); if (ct) out.connectTimeout = Number(ct) * 1000 // libpq: seconds -> ms
  const options = q.get('options'); if (options) out.options = options // '-c key=val …' startup options (URLSearchParams already percent-decoded)
  const cb = q.get('channel_binding')
  if (cb) {
    if (cb !== 'disable' && cb !== 'prefer' && cb !== 'require') throw new Error(`minipg: invalid channel_binding value ${JSON.stringify(cb)} (expected \`disable\` | \`prefer\` | \`require\`)`)
    out.channelBinding = cb
  }
  const sslmode = q.get('sslmode') ?? q.get('ssl')
  if (sslmode) {
    if (sslmode === 'disable') out.ssl = false
    else if (sslmode === 'verify-ca') out.ssl = 'verify-ca'
    else if (sslmode === 'verify-full') out.ssl = 'verify-full'
    else out.ssl = 'require' // allow | prefer | require | true -> encrypt (no hostname verification)
  }
  return out
}

/** If `config.url` is set, use the parsed connection string as DEFAULTS beneath the explicit fields, then
 *  drop `url`. Idempotent (no `url` -> returned unchanged). Explicit config always overrides url-derived. */
export function resolveUrl<T extends ConnectConfig>(config: T): T {
  if (!config.url) return config
  const out = { ...parseConnectionString(config.url) } as Record<string, unknown>
  for (const k of Object.keys(config)) {
    if (k === 'url') continue
    const v = (config as Record<string, unknown>)[k]
    if (v !== undefined) out[k] = v // explicit (defined) fields win over url-derived
  }
  return out as unknown as T
}

/** The channel_binding stance a config resolves to, from the field or from inside its `url`. */
function effectiveChannelBinding(config: ConnectConfig): ConnectConfig['channelBinding'] {
  return config.channelBinding ?? (config.url ? parseConnectionString(config.url).channelBinding : undefined)
}

/** Drop `channel_binding=require` down to `'prefer'`. SCRAM channel binding hashes the server
 *  certificate, and behind Neon's WebSocket proxy there is no certificate to hash — the proxy terminates
 *  TLS and speaks plaintext to the compute, so the server never offers SCRAM-SHA-256-PLUS. Neon also
 *  prints `?sslmode=require&channel_binding=require` on every connection string it issues, so treating it
 *  as fatal would reject the provider's own default URL.
 *
 *  This is exactly what Neon's own drivers do: `@neondatabase/serverless` always selects plain
 *  `SCRAM-SHA-256` and hardcodes the gs2 header `n,,` (`c=biws`), and never reads `channel_binding` out of
 *  the connection string at all. Relaxed, minipg/neon-ws puts the identical bytes on the wire.
 *
 *  Only for the Neon entries — a general-purpose transport that cannot bind should say so; see
 *  `refuseChannelBinding`. `disable`/`prefer` pass through untouched. */
// The return type widens `channelBinding` back to the union: with `T` preserved as-is, a caller passing
// a literal `'require'` would be told the result is still `'require'` — the one thing it cannot be.
export function relaxChannelBinding<T extends ConnectConfig>(config: T): Omit<T, 'channelBinding'> & Pick<ConnectConfig, 'channelBinding'> {
  return effectiveChannelBinding(config) === 'require' ? { ...config, channelBinding: 'prefer' } : config
}

/** Refuse `channel_binding=require` on a transport that cannot compute tls-server-end-point, naming the
 *  runtime limit that makes it impossible. Unlike the Neon entries — which point at one provider whose own
 *  drivers ignore the parameter — minipg/cf and minipg/deno dial any Postgres, so a caller who asked for
 *  binding gets told it cannot happen rather than being silently downgraded.
 *
 *  Thrown from the entry function, before a Pool exists, so it surfaces immediately; `fatal` keeps the
 *  breaker from treating it as an outage on any path that does reach a pool. */
export function refuseChannelBinding<T extends ConnectConfig>(config: T, entry: string, limit: string): T {
  if (effectiveChannelBinding(config) !== 'require') return config
  throw Object.assign(
    new Error(
      `minipg/${entry}: channel_binding=require cannot be honoured — ${limit}, so SCRAM's tls-server-end-point cannot be computed. ` +
      'Use `channel_binding=prefer` (or drop the parameter) to connect unbound, or `minipg/node` for a bound connection.',
    ),
    { fatal: true },
  )
}
