// Authentication tests for the minipg driver.
//   * PURE UNIT tests drive the exported auth primitives md5Password() and
//     scram() directly (no database).
//   * INTEGRATION tests log in over each real wire-protocol method against the
//     live cluster (postgres+scramuser over SCRAM, md5user over MD5) and assert
//     that wrong passwords reject cleanly.
// Grounded in src/auth.ts and src/connection.ts#auth. READ-ONLY: only `select`
// round-trips run against the shared cluster; no DDL/writes.
import { test, expect, describe } from 'bun:test'
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto'
import { md5Password, scram } from '../../src/auth.ts'
import { testConnect, testPool, caught, PgError } from '../helpers/db.ts'

// ---- independent reference crypto (mirrors src/auth.ts, computed separately) ----
const md5hex = (b: Buffer) => createHash('md5').update(b).digest('hex')
const refMd5 = (user: string, pwd: string, salt: Buffer) => {
  const inner = md5hex(Buffer.concat([Buffer.from(pwd, 'utf8'), Buffer.from(user, 'utf8')]))
  return 'md5' + md5hex(Buffer.concat([Buffer.from(inner, 'utf8'), salt]))
}
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest()
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()
const xor = (a: Buffer, b: Buffer) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i]! ^ b[i]!; return o }

// Pull the client nonce out of a clientFirst message: "n,,n=*,r=<nonce>".
const nonceOf = (clientFirst: string) => clientFirst.slice(clientFirst.indexOf('r=') + 2)

// Compute the expected base64 client proof for a given password/exchange,
// independently of scram() (passwords are NFKC-normalized to match the driver).
function refProof(password: string, clientNonce: string, serverFirst: string, salt: Buffer, iterations: number): string {
  const fullNonce = serverFirst.split(',').find((p) => p.startsWith('r='))!.slice(2)
  const clientFirstBare = `n=*,r=${clientNonce}`
  const clientFinalNoProof = `c=biws,r=${fullNonce}`
  const saltedPassword = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const clientKey = hmac(saltedPassword, 'Client Key')
  const storedKey = sha256(clientKey)
  const authMessage = `${clientFirstBare},${serverFirst},${clientFinalNoProof}`
  return xor(clientKey, hmac(storedKey, authMessage)).toString('base64')
}
// Correct server signature (v=) for the same exchange.
function refServerSig(password: string, clientNonce: string, serverFirst: string, salt: Buffer, iterations: number): string {
  const fullNonce = serverFirst.split(',').find((p) => p.startsWith('r='))!.slice(2)
  const clientFirstBare = `n=*,r=${clientNonce}`
  const clientFinalNoProof = `c=biws,r=${fullNonce}`
  const saltedPassword = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const authMessage = `${clientFirstBare},${serverFirst},${clientFinalNoProof}`
  return hmac(hmac(saltedPassword, 'Server Key'), authMessage).toString('base64')
}

// Build a syntactically valid server-first using the client's own nonce.
function makeServerFirst(clientNonce: string, salt: Buffer, iterations: number, extraNonce = 'SRV0123456789'): string {
  return `r=${clientNonce}${extraNonce},s=${salt.toString('base64')},i=${iterations}`
}

describe('md5Password() — golden vectors', () => {
  test('matches the md5(md5(pw+user)+salt) reference and is a 35-char md5... hex string', () => {
    const salt = Buffer.from([0x01, 0x02, 0x03, 0x04])
    const got = md5Password('md5user', 'md5pw', salt)
    expect(got).toBe(refMd5('md5user', 'md5pw', salt))
    expect(got).toMatch(/^md5[0-9a-f]{32}$/)
    expect(got.length).toBe(35)
  })

  test('binary (non-UTF8) salt bytes are concatenated raw, not as a UTF-8 string', () => {
    const salt = Buffer.from([0x00, 0xff, 0x80, 0x7f])
    expect(md5Password('md5user', 'md5pw', salt)).toBe(refMd5('md5user', 'md5pw', salt))
  })

  test('non-ASCII password uses raw UTF-8 bytes (no SASLprep on MD5)', () => {
    const salt = Buffer.from([0xde, 0xad, 0xbe, 0xef])
    // MD5 path: Buffer.from(password,'utf8'), no NFKC normalization.
    expect(md5Password('u', 'pä', salt)).toBe(refMd5('u', 'pä', salt))
  })
})

describe('scram() — client state machine', () => {
  test('clientFirst carries the gs2 header n,, and a base64 nonce', () => {
    const s = scram('pw')
    expect(s.mechanism).toBe('SCRAM-SHA-256')
    expect(s.clientFirst.startsWith('n,,n=*,r=')).toBe(true)
    const nonce = nonceOf(s.clientFirst)
    expect(nonce.length).toBe(24) // randomBytes(18) base64
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  })

  test('continue() emits c=biws, echoes the full server nonce, and a correct p= proof', () => {
    const password = 'scrampw'
    const salt = Buffer.from('0123456789abcdef', 'utf8')
    const iterations = 4096
    const s = scram(password)
    const clientNonce = nonceOf(s.clientFirst)
    const serverFirst = makeServerFirst(clientNonce, salt, iterations)
    const finalMsg = s.continue(serverFirst)
    expect(finalMsg.startsWith('c=biws,')).toBe(true)
    expect(finalMsg).toContain(`r=${clientNonce}SRV0123456789`)
    const proof = finalMsg.split('p=')[1]!
    expect(proof).toBe(refProof(password, clientNonce, serverFirst, salt, iterations))
  })

  test('server nonce that does not start with the client nonce throws', () => {
    const s = scram('pw')
    const salt = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
    const bad = `r=WRONGNONCExyz,s=${salt.toString('base64')},i=4096`
    expect(() => s.continue(bad)).toThrow(/server nonce mismatch/)
  })

  test('iteration count above the 100000 cap throws; the boundary 100000 is accepted', () => {
    const salt = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2])
    const over = scram('pw')
    const nOver = nonceOf(over.clientFirst)
    expect(() => over.continue(makeServerFirst(nOver, salt, 100001))).toThrow(/bad iteration count/)

    const ok = scram('pw')
    const nOk = nonceOf(ok.clientFirst)
    expect(() => ok.continue(makeServerFirst(nOk, salt, 100000))).not.toThrow()
  })

  test('non-positive / non-numeric iteration counts throw', () => {
    const salt = Buffer.from([1, 1, 1, 1, 1, 1, 1, 1])
    const zero = scram('pw'); const nZero = nonceOf(zero.clientFirst)
    expect(() => zero.continue(makeServerFirst(nZero, salt, 0))).toThrow(/bad iteration count/)

    const nan = scram('pw'); const nNan = nonceOf(nan.clientFirst)
    const bad = `r=${nNan}X,s=${salt.toString('base64')},i=abc`
    expect(() => nan.continue(bad)).toThrow(/bad iteration count/)
  })

  test('final() accepts a correct server signature and rejects a tampered one', () => {
    const password = 'scrampw'
    const salt = Buffer.from('feedface00112233', 'utf8')
    const iterations = 4096

    // happy path: correct v= verifies
    const good = scram(password)
    const gNonce = nonceOf(good.clientFirst)
    const gServerFirst = makeServerFirst(gNonce, salt, iterations)
    good.continue(gServerFirst)
    const sig = refServerSig(password, gNonce, gServerFirst, salt, iterations)
    expect(() => good.final(`v=${sig}`)).not.toThrow()

    // tampered: flip one base64 char of v=
    const bad = scram(password)
    const bNonce = nonceOf(bad.clientFirst)
    const bServerFirst = makeServerFirst(bNonce, salt, iterations)
    bad.continue(bServerFirst)
    const realSig = refServerSig(password, bNonce, bServerFirst, salt, iterations)
    const flipped = (realSig[0] === 'A' ? 'B' : 'A') + realSig.slice(1)
    expect(() => bad.final(`v=${flipped}`)).toThrow(/server signature verification failed/)
  })

  test('final() before continue(), or a server-final missing v=, throws "missing server signature"', () => {
    const noState = scram('pw')
    expect(() => noState.final('v=anything')).toThrow(/missing server signature/)

    const salt = Buffer.from([2, 2, 2, 2, 2, 2, 2, 2])
    const s = scram('pw')
    const n = nonceOf(s.clientFirst)
    s.continue(makeServerFirst(n, salt, 4096))
    expect(() => s.final('nothing-here')).toThrow(/missing server signature/) // no v= attribute
  })

  test('saslprep (NFKC) is applied to the password before PBKDF2', () => {
    // 'ﬁ' (U+FB01 LATIN SMALL LIGATURE FI) NFKC-decomposes to 'fi'.
    const salt = Buffer.from('saslprepsalt0000', 'utf8')
    const iterations = 4096
    const s = scram('ﬁ') // 'ﬁ'
    const clientNonce = nonceOf(s.clientFirst)
    const serverFirst = makeServerFirst(clientNonce, salt, iterations)
    const proof = s.continue(serverFirst).split('p=')[1]!
    // matches the NFKC-normalized form...
    expect(proof).toBe(refProof('fi', clientNonce, serverFirst, salt, iterations))
    // ...and differs from the un-normalized raw input.
    const rawSalted = pbkdf2Sync('ﬁ', salt, iterations, 32, 'sha256')
    const normSalted = pbkdf2Sync('fi', salt, iterations, 32, 'sha256')
    expect(rawSalted.equals(normSalted)).toBe(false)
  })
})

describe('integration — each auth method logs in (read-only)', () => {
  test('SCRAM: postgres (default) authenticates; select 1 and current_user round-trip', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select 1 as one, current_user as who')
      const row = r.rows[0] as unknown[]
      expect(row[0]).toBe(1)
      expect(row[1]).toBe('postgres')
    } finally { await c.end() }
  })

  test('SCRAM: scramuser authenticates; select 1 and current_user round-trip', async () => {
    const c = await testConnect({ user: 'scramuser', password: 'scrampw' })
    try {
      const r = await c.query('select 1 as one, current_user as who')
      const row = r.rows[0] as unknown[]
      expect(row[0]).toBe(1)
      expect(row[1]).toBe('scramuser')
    } finally { await c.end() }
  })

  test('MD5: md5user authenticates; select 1 and current_user round-trip', async () => {
    const c = await testConnect({ user: 'md5user', password: 'md5pw' })
    try {
      const r = await c.query('select 1 as one, current_user as who')
      const row = r.rows[0] as unknown[]
      expect(row[0]).toBe(1)
      expect(row[1]).toBe('md5user')
    } finally { await c.end() }
  })

  test('50 parallel SCRAM connections all authenticate (no shared SASL state leak)', async () => {
    const conns = await Promise.all(
      Array.from({ length: 50 }, () => testConnect({ user: 'scramuser', password: 'scrampw' })),
    )
    try {
      const results = await Promise.all(conns.map((c) => c.query('select 1')))
      for (const r of results) expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await Promise.all(conns.map((c) => c.end()))
    }
  }, 30000)
})

describe('integration — wrong / missing password rejects cleanly (28P01)', () => {
  test('SCRAM wrong password -> connect rejects with PgError 28P01', async () => {
    const err = await caught(() => testConnect({ user: 'scramuser', password: 'definitely-wrong' }))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('28P01')
  })

  test('MD5 wrong password -> connect rejects with PgError 28P01', async () => {
    const err = await caught(() => testConnect({ user: 'md5user', password: 'definitely-wrong' }))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('28P01')
  })

  test('missing password (defaults to "") for a password-requiring role -> 28P01, not a hang', async () => {
    const err = await caught(() => testConnect({ user: 'scramuser', password: '' }))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('28P01')
  }, 15000)

  test('wrong password via pool surfaces as a rejection to the caller (no unhandled error)', async () => {
    const pool = testPool({ user: 'md5user', password: 'definitely-wrong', max: 1 })
    try {
      const err = await caught(() => pool.query('select 1'))
      expect(err).toBeInstanceOf(Error)
      expect((err as PgError).code).toBe('28P01')
    } finally { await pool.end() }
  })
})

describe('chaos — own backend killed mid-session rejects in-flight, never hangs', () => {
  test('pg_terminate_backend on a victim settles its next query as an error', async () => {
    const victim = await testConnect({ user: 'scramuser', password: 'scrampw' })
    const killer = await testConnect()
    try {
      const pid = victim.backendKey!.pid
      await killer.query('select pg_terminate_backend($1)', [pid])
      const err = await caught(() => victim.query('select 1'))
      expect(err).toBeInstanceOf(Error)
    } finally {
      await victim.end()
      await killer.end()
    }
  }, 15000)
})

// ---- Roadmap / out-of-scope (pending specs; no failing assertions) ----
describe('roadmap (pending)', () => {
  // Driver only checks i>0 && i<=100000; it accepts the spec-unsafe i=1 today.
  test('SCRAM iteration floor (i>=4096) should be enforced', () => {
    // note: documents today's ACTUAL behavior — i=1 is currently ACCEPTED.
    const salt = Buffer.from([3, 3, 3, 3, 3, 3, 3, 3])
    const s = scram('pw'); const n = nonceOf(s.clientFirst)
    expect(() => s.continue(makeServerFirst(n, salt, 1))).not.toThrow()
  })
  test.todo('SCRAM channel binding (-PLUS / tls-server-end-point)', () => {})
  test.todo('dynamic/async function-valued password or user', () => {})
  test.todo('.pgpass / PGPASSFILE credential file lookup', () => {})
  test.todo('client-cert / IAM-token / GSSAPI auth', () => {})
})
