// Pure unit tests for tlsOptions(): the sslmode -> tls.connect option resolution. No network.
import { describe, test, expect } from 'bun:test'
import tls from 'node:tls'
import { tlsOptions } from '../../src/transport-node.ts'

describe('tlsOptions: sslmode -> tls.connect options', () => {
  test("'require' / true: encrypt, no verification", () => {
    expect(tlsOptions('require', 'db.example.com')).toEqual({ servername: 'db.example.com', rejectUnauthorized: false })
    expect(tlsOptions(true, 'db.example.com')).toEqual({ servername: 'db.example.com', rejectUnauthorized: false })
  })

  test("'verify-ca': verify chain, skip hostname (checkServerIdentity returns undefined)", () => {
    const o = tlsOptions('verify-ca', 'db.example.com')
    expect(o.rejectUnauthorized).toBe(true)
    expect(typeof o.checkServerIdentity).toBe('function')
    expect(o.checkServerIdentity!('anything', {} as tls.PeerCertificate)).toBeUndefined()
  })

  test("'verify-full': verify chain + hostname (default servername-based check)", () => {
    expect(tlsOptions('verify-full', 'db.example.com')).toEqual({ servername: 'db.example.com', rejectUnauthorized: true })
  })

  test('SNI: hostname becomes servername; IP does NOT (RFC 6066)', () => {
    expect(tlsOptions('verify-full', 'db.example.com').servername).toBe('db.example.com')
    expect(tlsOptions('verify-full', '10.0.0.5').servername).toBeUndefined()
  })

  test('IP host with verification on gets an explicit IP identity check', () => {
    const o = tlsOptions('verify-full', '10.0.0.5')
    expect(o.rejectUnauthorized).toBe(true)
    expect(typeof o.checkServerIdentity).toBe('function') // verifies the IP against the cert's IP SANs
    // 'require' (no verification) on an IP does NOT add the check
    expect(tlsOptions('require', '10.0.0.5').checkServerIdentity).toBeUndefined()
  })

  test('object: verifies by default, user fields win (rejectUnauthorized / ca / servername)', () => {
    const o = tlsOptions({ ca: 'CA-PEM', rejectUnauthorized: false, servername: 'custom' }, 'db.example.com')
    expect(o.ca).toBe('CA-PEM'); expect(o.rejectUnauthorized).toBe(false); expect(o.servername).toBe('custom')
    expect(tlsOptions({ ca: 'CA-PEM' }, 'h').rejectUnauthorized).toBe(true) // no override -> verify on
  })

  test("object on an IP with an explicit servername: user's servername-based check wins (no IP override)", () => {
    const o = tlsOptions({ ca: 'CA', rejectUnauthorized: true, servername: 'name.example' }, '10.0.0.5')
    expect(o.servername).toBe('name.example')
    expect(o.checkServerIdentity).toBeUndefined() // we don't inject the IP check when a servername is set
  })
})
