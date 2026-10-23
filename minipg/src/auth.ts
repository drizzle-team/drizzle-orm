// Authentication helpers: MD5 and SCRAM-SHA-256 (SASL). Pure node:crypto.
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const md5hex = (buf: Buffer) => createHash('md5').update(buf).digest('hex')

/** 'md5' + md5( md5(password + user) + salt ) */
export function md5Password(user: string, password: string, salt: Buffer): string {
  const inner = md5hex(Buffer.concat([Buffer.from(password, 'utf8'), Buffer.from(user, 'utf8')]))
  return 'md5' + md5hex(Buffer.concat([Buffer.from(inner, 'utf8'), salt]))
}

// SASLprep (RFC 4013) — common-case NFKC normalization. Fixes the silent 28P01
// failures on non-ASCII passwords that postgres.js has (it skips this entirely).
const saslprep = (s: string) => s.normalize('NFKC')

const xor = (a: Buffer, b: Buffer) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i]! ^ b[i]!; return o }
const hmac = (key: Buffer | string, str: string) => createHmac('sha256', key).update(str).digest()
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest()

export interface Scram {
  mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-256-PLUS'
  clientFirst: string
  continue(serverFirst: string): string
  final(serverFinal: string): void
}

export interface ScramOptions {
  /** Channel-binding data for SCRAM-SHA-256-PLUS: the tls-server-end-point hash of the server's
   *  certificate. Present -> the -PLUS mechanism with gs2 header 'p=tls-server-end-point,,'. */
  cbData?: Buffer
  /** gs2 flag when NOT binding: 'n' = client cannot bind (default); 'y' = client CAN bind but the
   *  server didn't offer -PLUS — RFC 5802's downgrade detection: a server that DID offer it must
   *  reject 'y', catching a MITM that stripped the mechanism list. */
  gs2?: 'n' | 'y'
}

/** Minimal SCRAM-SHA-256[-PLUS] client state machine. The channel binding rides in two places:
 *  the gs2 header on client-first, and the c= attribute of client-final = base64(gs2 header +
 *  binding data) — inside the signed auth message, so a MITM can't rewrite either. */
export function scram(password: string, opts: ScramOptions = {}): Scram {
  const clientNonce = randomBytes(18).toString('base64')
  const clientFirstBare = `n=*,r=${clientNonce}`
  const gs2Header = opts.cbData ? 'p=tls-server-end-point,,' : `${opts.gs2 ?? 'n'},,`
  const cAttr = Buffer.concat([Buffer.from(gs2Header, 'utf8'), opts.cbData ?? Buffer.alloc(0)]).toString('base64') // 'biws' for n,, · 'eSws' for y,,
  let serverSignature: Buffer | null = null
  return {
    mechanism: opts.cbData ? 'SCRAM-SHA-256-PLUS' : 'SCRAM-SHA-256',
    clientFirst: `${gs2Header}${clientFirstBare}`,
    continue(serverFirst) {
      const attrs: Record<string, string> = {}
      for (const p of serverFirst.split(',')) attrs[p[0]!] = p.slice(2)
      const nonce = attrs.r!, saltB64 = attrs.s!, iterStr = attrs.i!
      if (!nonce.startsWith(clientNonce)) throw new Error('SCRAM: server nonce mismatch')
      const iterations = parseInt(iterStr, 10)
      if (!(iterations > 0 && iterations <= 100000)) throw new Error(`SCRAM: bad iteration count ${iterStr}`)
      const salt = Buffer.from(saltB64, 'base64')
      const saltedPassword = pbkdf2Sync(saslprep(password), salt, iterations, 32, 'sha256')
      const clientKey = hmac(saltedPassword, 'Client Key')
      const storedKey = sha256(clientKey)
      const clientFinalNoProof = `c=${cAttr},r=${nonce}`
      const authMessage = `${clientFirstBare},${serverFirst},${clientFinalNoProof}`
      const clientProof = xor(clientKey, hmac(storedKey, authMessage))
      serverSignature = hmac(hmac(saltedPassword, 'Server Key'), authMessage)
      return `${clientFinalNoProof},p=${clientProof.toString('base64')}`
    },
    final(serverFinal) {
      const part = serverFinal.split(',').find((p) => p.startsWith('v='))
      if (!part || !serverSignature) throw new Error('SCRAM: missing server signature')
      const got = Buffer.from(part.slice(2), 'base64')
      if (got.length !== serverSignature.length || !timingSafeEqual(got, serverSignature))
        throw new Error('SCRAM: server signature verification failed')
    },
  }
}

// ---- channel binding (RFC 5929 tls-server-end-point) -------------------------------------------
// The binding data is a hash of the server's DER certificate, using the hash from the cert's OWN
// signatureAlgorithm — except MD5/SHA-1, which map to SHA-256 (RFC 5929 §4.1; same rule libpq gets
// from OBJ_find_sigid_algs). node's getPeerCertificate() doesn't expose the algorithm, so read the
// AlgorithmIdentifier OID with a minimal ASN.1 walk: Certificate ::= SEQUENCE { tbsCertificate,
// signatureAlgorithm SEQUENCE { OID, … }, signature }.
const SIG_OID_HASH: Record<string, string> = {
  '2a864886f70d010104': 'sha256', // md5WithRSAEncryption  -> sha256 (RFC 5929)
  '2a864886f70d010105': 'sha256', // sha1WithRSAEncryption -> sha256 (RFC 5929)
  '2a864886f70d01010b': 'sha256', // sha256WithRSAEncryption
  '2a864886f70d01010c': 'sha384',
  '2a864886f70d01010d': 'sha512',
  '2a864886f70d01010e': 'sha224',
  '2a8648ce3d0401': 'sha256',     // ecdsa-with-SHA1 -> sha256 (RFC 5929)
  '2a8648ce3d040302': 'sha256',   // ecdsa-with-SHA256
  '2a8648ce3d040303': 'sha384',
  '2a8648ce3d040304': 'sha512',
}

/** tls-server-end-point binding data for a DER certificate, or null when the signature algorithm
 *  is unsupported (Ed25519, RSA-PSS — libpq/OpenSSL can't derive a hash for those either). */
export function tlsServerEndPoint(der: Buffer): Buffer | null {
  try {
    const hdr = (o: number): { len: number; body: number } => {
      let l = der[o + 1]!
      if (l < 0x80) return { len: l, body: o + 2 }
      const n = l & 0x7f; l = 0
      for (let i = 0; i < n; i++) l = l * 256 + der[o + 2 + i]!
      return { len: l, body: o + 2 + n }
    }
    const outer = hdr(0)                 // Certificate SEQUENCE
    const tbs = hdr(outer.body)          // tbsCertificate (skip)
    const sig = hdr(tbs.body + tbs.len)  // signatureAlgorithm SEQUENCE
    if (der[sig.body] !== 0x06) return null // AlgorithmIdentifier starts with an OID
    const oid = hdr(sig.body)
    const algo = SIG_OID_HASH[der.subarray(oid.body, oid.body + oid.len).toString('hex')]
    return algo ? createHash(algo).update(der).digest() : null
  } catch { return null }
}

/** Peer-certificate DER from a (maybe-)TLS socket, or null when unavailable. Tries
 *  getPeerX509Certificate() first — Bun implements it while its getPeerCertificate(false)
 *  returns an EMPTY object — then getPeerCertificate(true), which works on both runtimes. */
export function peerCertDer(sock: unknown): Buffer | null {
  try {
    const s = sock as { getPeerX509Certificate?: () => { raw?: Buffer } | undefined; getPeerCertificate?: (detailed?: boolean) => { raw?: Buffer } | null } | null
    const x = typeof s?.getPeerX509Certificate === 'function' ? s.getPeerX509Certificate()?.raw : undefined
    if (x) return x
    const c = typeof s?.getPeerCertificate === 'function' ? s.getPeerCertificate(true)?.raw : undefined
    return c ?? null
  } catch { return null }
}

/** AuthenticationSASL body (AFTER the int32 code): NUL-separated mechanism names, empty-terminated. */
export function parseSaslMechanisms(body: Buffer): string[] {
  const out: string[] = []
  let o = 4
  while (o < body.length) { const z = body.indexOf(0, o); if (z <= o) break; out.push(body.toString('utf8', o, z)); o = z + 1 }
  return out
}

/** Pick and build the SCRAM state for a connection: bind to the TLS channel when the transport
 *  exposes the server certificate AND the server offers -PLUS; otherwise plain SCRAM with the
 *  honest gs2 flag ('y' when we COULD have bound — the downgrade tripwire). `mode` is the
 *  channel_binding stance; 'require' throws with the exact reason it can't be satisfied. */
export function scramForChannel(password: string, mechanisms: string[], mode: 'disable' | 'prefer' | 'require', certDer: Buffer | null): Scram {
  const plusOffered = mechanisms.includes('SCRAM-SHA-256-PLUS')
  const cb = mode !== 'disable' && certDer ? tlsServerEndPoint(certDer) : null
  if (mode === 'require') {
    if (!certDer) throw new Error('minipg: channel_binding=require — this transport does not expose the server certificate, so tls-server-end-point cannot be computed. The built-in node TLS transport does; a custom `socket` must resolve to a stream carrying `getPeerX509Certificate()` or `getPeerCertificate(true)` with a `raw` DER. Use `channel_binding=prefer` to connect unbound.')
    if (!cb) throw new Error('minipg: channel_binding=require — cannot compute tls-server-end-point for this server certificate (unsupported signature algorithm, e.g. Ed25519/RSA-PSS). Use `channel_binding=prefer` to connect unbound.')
    if (!plusOffered) throw new Error('minipg: channel_binding=require — the server did not offer SCRAM-SHA-256-PLUS. Use `channel_binding=prefer` to connect unbound.')
  }
  if (cb && plusOffered) return scram(password, { cbData: cb })
  return scram(password, { gs2: cb ? 'y' : 'n' })
}
