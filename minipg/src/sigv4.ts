// AWS Signature Version 4 request signing — pure WebCrypto (crypto.subtle), ZERO dependencies. Runs on
// Node 18+, Bun, Deno, Cloudflare Workers, and browsers. Used by minipg/aurora to sign RDS Data API calls.
// (Only the classic SigV4 HMAC-SHA256 flow — not SigV4a/ECDSA, which the Data API doesn't require.)

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  /** Session token for temporary/STS credentials — sent + signed as x-amz-security-token. */
  sessionToken?: string
}

const enc = new TextEncoder()
function toHex(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (let i = 0; i < u.length; i++) s += u[i]!.toString(16).padStart(2, '0')
  return s
}
async function sha256Hex(data: string): Promise<string> { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data))) }
async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as never, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data) as never))
}
async function signingKey(secret: string, date: string, region: string, service: string): Promise<Uint8Array> {
  let k = await hmac(enc.encode('AWS4' + secret), date)
  k = await hmac(k, region); k = await hmac(k, service)
  return hmac(k, 'aws4_request')
}
/** Current UTC time as an SigV4 basic-format timestamp `YYYYMMDDTHHMMSSZ`. */
export function amzDateNow(): string { return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '') }

export interface SigV4Input {
  method: string
  /** Canonical URI path (e.g. `/Execute`). */
  path: string
  /** Canonical query string source (raw, un-sorted `k=v&…`) — usually empty for POST APIs. */
  query?: string
  /** Headers to sign; MUST include host (and content-type for JSON). Case-insensitive. */
  headers: Record<string, string>
  body: string
  service: string
  region: string
  credentials: AwsCredentials
  amzDate: string
}

/** Low-level SigV4: compute the Authorization header + intermediates for an already-assembled header set.
 *  Exposed so it can be tested directly against AWS's published signing vectors. */
export async function signV4(i: SigV4Input): Promise<{ authorization: string; signature: string; canonicalHash: string; signedHeaders: string }> {
  const date = i.amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(i.body)
  const lc: Record<string, string> = {}
  for (const k of Object.keys(i.headers)) lc[k.toLowerCase()] = i.headers[k]!
  const names = Object.keys(lc).sort()
  const canonicalHeaders = names.map((n) => `${n}:${lc[n]!.trim().replace(/\s+/g, ' ')}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalQuery = (i.query ?? '') === '' ? '' : (i.query!).split('&').map((p) => { const eq = p.indexOf('='); const k = eq < 0 ? p : p.slice(0, eq); const v = eq < 0 ? '' : p.slice(eq + 1); return [encodeURIComponent(decodeURIComponent(k)), encodeURIComponent(decodeURIComponent(v))] as const }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const canonicalRequest = [i.method, i.path || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const canonicalHash = await sha256Hex(canonicalRequest)
  const scope = `${date}/${i.region}/${i.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, canonicalHash].join('\n')
  const signature = toHex(await hmac(await signingKey(i.credentials.secretAccessKey, date, i.region, i.service), stringToSign))
  const authorization = `AWS4-HMAC-SHA256 Credential=${i.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return { authorization, signature, canonicalHash, signedHeaders }
}

export interface SignRequestInput {
  method: string
  url: string
  body: string
  service: string
  region: string
  credentials: AwsCredentials
  /** Extra headers to sign + send (e.g. content-type). */
  headers?: Record<string, string>
  /** Override the request timestamp (testing). Defaults to now. */
  amzDate?: string
}

/** Sign a full HTTP request and return the complete header set to send. Adds host, x-amz-date,
 *  x-amz-content-sha256, x-amz-security-token (if a session token), and Authorization. `host` is signed
 *  but NOT returned (fetch sets it). */
export async function signRequest(i: SignRequestInput): Promise<Record<string, string>> {
  const u = new URL(i.url)
  const amzDate = i.amzDate ?? amzDateNow()
  const payloadHash = await sha256Hex(i.body)
  const toSign: Record<string, string> = { ...(i.headers ?? {}), host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  if (i.credentials.sessionToken) toSign['x-amz-security-token'] = i.credentials.sessionToken
  const { authorization } = await signV4({ method: i.method, path: u.pathname, query: u.search.replace(/^\?/, ''), headers: toSign, body: i.body, service: i.service, region: i.region, credentials: i.credentials, amzDate })
  const out: Record<string, string> = { ...(i.headers ?? {}), 'X-Amz-Date': amzDate, 'X-Amz-Content-Sha256': payloadHash, Authorization: authorization }
  if (i.credentials.sessionToken) out['X-Amz-Security-Token'] = i.credentials.sessionToken
  return out
}
