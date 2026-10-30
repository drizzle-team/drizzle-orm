# Node & Runtime Dependencies — postgres.js vs node-postgres

## Summary

The two drivers achieve cross-runtime portability through fundamentally different strategies.

**postgres.js** keeps a single ESM source tree under `src/` that imports Node builtins by bare specifier (`net`, `tls`, `crypto`, `stream`, `perf_hooks`, `os`, `fs`) and leans on the `Buffer`/`process`/`setImmediate` globals. Portability is a **build-time** concern: three string-rewriting transpilers (`transpile.cjs`, `transpile.deno.js`, `transpile.cf.js`) emit per-runtime trees (`cjs/`, `deno/`, `cf/`) that swap those imports for runtime-specific polyfills (`cf/polyfills.js`, `deno/polyfills.js`, Deno std-lib URLs), and a conditional `exports` map routes each runtime to the right pre-built variant. Bun runs the untouched `src/` source directly. There is no runtime feature detection — the dependency surface is frozen when `npm run build` runs, and each target gets its own transpiled copy with polyfills baked in.

**node-postgres** instead splits responsibilities into layers and keeps the wire core pure. `pg-protocol` is effectively runtime-pure (only a global `Buffer`), serializing/parsing bytes with no socket, crypto, or filesystem dependency. The `pg` core then bolts on a **swappable socket layer**: `lib/stream.js` runtime-detects the host and either uses Node `net`/`tls` (Node/Bun/Deno) or swaps in `pg-cloudflare`'s `CloudflareSocket` (built on the workerd `cloudflare:sockets` builtin) for Cloudflare Workers. A separate **optional native path** (`pg-native` over the compiled `libpq` addon) delegates the entire protocol/TLS/auth stack to battle-tested C code, at the cost of Node-only portability. Auth crypto defensively falls back from Node `crypto` to WebCrypto/`globalThis.crypto`. Portability is thus a **runtime-dispatch + optional-dependency** concern rather than a build-time transpile.

## Cross-runtime support matrix

| Runtime | postgres.js | node-postgres |
|---|---|---|
| Node | Full support — canonical target (`exports.import`→`src/`, `exports.default`→`cjs/`). TCP+unix sockets, SSL, md5+SCRAM, `sql.file()`, COPY, large objects, logical replication. | Full support — pure-JS `pg` core uses real `net`/`tls`/`dns`/`crypto`; all satellites (`pg-pool`, `pg-cursor`, `pg-query-stream`, `pg-connection-string`) work. Native `libpq` path also available. |
| Bun | Full support — runs untouched `src/` ESM (`exports.bun`); Bun implements the Node builtins. | Full support — Bun implements `net`/`tls`/`dns`/`crypto`; `isCloudflareRuntime()` is false so Node socket funcs are used. |
| Deno | Supported via separate `deno/` build (consumed out-of-band from `deno.land/x/postgresjs`, no npm `exports` key). Uses `Deno.connect`/`Deno.startTls`, std `node/*` shims; unix sockets supported. Caveats: keep-alive interval dropped, `createHmac` swapped for a std impl, pinned `std@0.132.0` URLs. | Supported via Node-compat (`node:net`/`node:tls`/`node:crypto`). Caveat: relies on Deno shimming bare (non-`node:`-prefixed) builtin specifiers; `util` shim is the main friction point for cursor/stream. Native path needs `--allow-env`/FFI and is unsupported in practice. |
| Cloudflare Workers | Supported via dedicated `cf/` build (`exports.workerd`) using `cloudflare:sockets` + WebCrypto polyfills. TCP+STARTTLS only. Degraded: `sql.file()` throws (no `fs`), `process.env` is `{}` (config must be explicit), `os.userInfo()` faked to `postgres`, no unix sockets, no real keep-alive, pool `max` forced to 3, md5-via-WebCrypto may fail. | Supported — `pg-protocol` core is socket-free and runs given a `Buffer` polyfill; `pg/lib/stream.js` detects workerd and swaps in `pg-cloudflare`'s `CloudflareSocket` (lazy `import('cloudflare:sockets')`, in-band `startTls()`). Requires `nodejs_compat` (Buffer/events/process). Off-path features (`dns.lookup`, `.pgpass`, native) not Worker-safe; no unix sockets. |
| native/libpq | Not applicable — postgres.js has no native binding; it is always pure-JS over `net`/`tls`. | Optional via `pg-native`→`libpq` node-gyp addon. **Node-only**: needs a C/C++ toolchain, system `libpq`/OpenSSL, and a platform-matching prebuilt binary. Entire protocol/TLS/SCRAM/COPY runs in C, bypassing `pg-protocol`/JS sockets. `require` is try/catch-guarded so a missing addon degrades to `native === null`. No edge/serverless/Workers support. |


## postgres.js — core (Node/Bun)

The core `src/` build (used by Node via `exports.import` and Bun via `exports.bun`, both resolving to `./src/index.js` — package.json:10-12) has a small, conventional Node footprint: `net`/`tls` for the wire transport, `crypto` for auth, `stream` only for COPY and large objects, `perf_hooks` for reconnect-backoff timing, and `os`/`fs` for two narrow features (default username and `sql.file()`). Everything else rides on globals (`Buffer`, `process.env`, `globalThis`, `setImmediate`/`setTimeout`). All eight builtins are imported unconditionally at module load (static ESM `import`), but most are only *exercised* under specific circumstances noted below.

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `net` | `new net.Socket()` as the default transport socket; `net.isIP()` to decide TLS `servername` (skip SNI for IP hosts) | Always, unless caller passes a custom `options.socket(options)` factory (then `net.Socket` is bypassed); `net.isIP` only when SSL upgrade runs | connection.js:1, :134 (`new net.Socket()`), :277 (`net.isIP`) |
| `tls` | `tls.connect(options)` to upgrade the plain socket to TLS (incl. `ALPNProtocols`/`rejectUnauthorized`/object-merge of user ssl config) | Only with SSL — i.e. `ssl` truthy: `'require'`/`'allow'`/`'prefer'`/`'verify-full'`/object, or `sslnegotiation === 'direct'` | connection.js:2, :289 |
| `crypto` | `randomBytes(18)` → SCRAM client nonce; `pbkdf2Sync(...,'sha256')` → SCRAM salted password; `createHash('md5')` → MD5 auth; `createHmac('sha256')` and `createHash('sha256')` → SCRAM HMAC/digest | Only during authentication: `createHash('md5')` for `AuthenticationMD5Password`; `randomBytes`/`pbkdf2Sync`/`hmac`/`sha256` for SCRAM-SHA-256 (SASL). Never touched for trust/no-password auth | connection.js:3, :708 (randomBytes), :717 (pbkdf2Sync), :1023 (md5), :1027 (hmac sha256), :1031 (sha256) |
| `stream` (`Stream`) | `Stream.Readable`/`Writable`/`Duplex` wrappers exposing COPY IN/OUT and large-object I/O as Node streams | Only when COPY is used (`copy`/`writable`/`readable`/`duplex` on a query) or large objects (`largeObject`) are used; never for ordinary queries | connection.js:4, :858/:878/:886; large.js:1, :43/:61 |
| `perf_hooks` (`performance`) | `performance.now()` for reconnect backoff math (`closedTime + delay - now`) and recording last-closed time | Always — part of the connect/reconnect lifecycle | connection.js:5, :362, :454 |
| `os` | `os.userInfo().username` for the default DB user/login | Always at config time, but best-effort: wrapped in try/catch that falls back to `process.env.USERNAME/USER/LOGNAME` if `userInfo()` throws (e.g. sandboxed runtimes) | index.js:1, :563 |
| `fs` | `fs.readFile(path,'utf8',...)` to load a `.sql` file for the `sql.file(path)` query helper | Only when `sql.file()` is called; not used for `.pgpass` or SSL cert files in this core build | index.js:2, :132 |
| `Buffer` (global) | Wire-message framing/concat (`bytes.js` growable buffer), incoming buffering, hex/base64 encoding of auth + bytea, replication LSN packing | Always (every byte on the wire) | bytes.js:2,:22,:50,:58,:70; connection.js:21,:83,:192,:247,:310,:696-733,:1036; types.js:37-38; subscribe.js:97,:130 |
| `process` (global) | `process.env.PG*` and connection defaults; username fallback | Always at config/parse time | index.js:434 (`process.env`), :565 (USERNAME/USER/LOGNAME) |
| `globalThis` (global) | `globalThis.Cloudflare` feature-detect to lower default pool `max` (3 on Workers vs 10) | Always at config time (a cheap runtime probe) | index.js:449 |
| `setImmediate` / `clearImmediate` (global timers) | Batch socket writes — coalesce buffered chunks into one `nextWrite` | Always (write path) | connection.js:250, :256 |
| `setTimeout` / `clearTimeout` (global timers) | Reconnect scheduling (backoff) and idle/connect timeout handling | Always (connection lifecycle) | connection.js:362, :1050, :1053-1054 |

### Portability notes
- **Node**: fully supported — this is the canonical target (`exports.import` → `src/index.js`). All builtins resolve natively.
- **Bun**: supported and explicitly targeted (`exports.bun` → `src/index.js`, package.json:10). Bun implements `net`, `tls`, `crypto`, `stream`, `perf_hooks`, `os`, `fs`, and Node globals, so the same source runs unmodified.
- **Deno / Cloudflare Workers (workerd)**: NOT served by this core build — they get separate entrypoints (`exports.deno` and `exports.workerd` → `./cf/src/index.js`, package.json:11). The reason is visible in this code: the hard dependencies on `net.Socket`/`tls.connect` (raw TCP + TLS upgrade) and Node `stream` are not available on Workers, and `os.userInfo()`/`fs.readFile` have no meaning there. The `cf/` variant replaces the transport (Cloudflare `connect()` sockets) and drops `os`/`fs`/`perf_hooks` reliance; the `globalThis.Cloudflare` probe at index.js:449 is the only Workers-awareness baked into the core file itself.
- **Custom transport escape hatch**: passing `options.socket` (connection.js:132) lets a host avoid `new net.Socket()`, but `tls.connect` (SSL) and the `crypto` auth paths still hard-require Node-builtin shims, so a non-Node runtime cannot use SSL or SCRAM through the core build without polyfills.
- **Soft vs hard deps**: `fs` (only `sql.file`), `stream` (only COPY/large objects), and the SCRAM half of `crypto` are lazily *exercised*, so a deployment that avoids those features touches a smaller real surface — but because all imports are static ESM at top-of-file, the modules must still *resolve* at load time on whatever runtime is used.


## postgres.js — Deno / Cloudflare / CJS variants

postgres.js authors a single ESM source under `src/` that imports Node builtins by bare specifier (`net`, `tls`, `crypto`, `stream`, `perf_hooks`, `os`, `fs`) and leans on the `Buffer`/`process`/`setImmediate` globals. Portability is achieved entirely at **build time** by three string-rewriting transpilers (`transpile.cjs`, `transpile.deno.js`, `transpile.cf.js`) that swap those imports for per-runtime shims (`cf/polyfills.js`, `deno/polyfills.js`, Deno std-lib URLs) plus a `package.json` conditional-`exports` map that routes each runtime to the right pre-built tree. There is no runtime feature detection — the surface is fixed when `npm run build` emits `cjs/`, `deno/`, and `cf/`.

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `net` | TCP/unix `Socket` + `net.isIP()` (servername / IPv4-IPv6 detection) | Always (every connection) | src/connection.js:1, :134, :277, :351 |
| `tls` | `tls.connect()` STARTTLS upgrade of the live socket | Only when `ssl` is set (`require`/`allow`/`prefer`/`object`/direct negotiation) | src/connection.js:2, :283-289 |
| `crypto` | `randomBytes` (SCRAM nonce), `pbkdf2Sync`, `createHash('md5'/'sha256')`, `createHmac('sha256')` | Only during auth handshake — md5 or SASL/SCRAM-SHA-256 | src/connection.js:3, :708, :717, :1023, :1027, :1031 |
| `stream` (`Stream`) | Backpressure / readable-writable plumbing for COPY and large objects | Always imported by connection.js; large.js only used by `sql.largeObject()` | src/connection.js:4, src/large.js:1 |
| `perf_hooks` (`performance`) | `performance.now()` for reconnect backoff timing | Always (reconnect/close path) | src/connection.js:5, :362, :454 |
| `os` | `os.userInfo().username` as default DB user | Only when no user supplied in URL/options | src/index.js:1, :563 |
| `fs` | `fs.readFile()` backing `sql.file(path)` | Only when `sql.file()` is called | src/index.js:2, :132 |
| `Buffer` (global) | All wire-protocol byte assembly (alloc/concat/byteLength) | Always | src/bytes.js:2-70, src/connection.js:21+, src/types.js:37, src/subscribe.js:97 |
| `process` (global) | `process.env` (config defaults), `process.env.USER/USERNAME/LOGNAME` | Always read at config; user fallback only when unset | src/index.js:434, :565 |
| `globalThis.Cloudflare` (global) | Caps default pool `max` to 3 on Workers | Always read; branch taken only on workerd | src/index.js:449 |
| `setImmediate` (global) | Coalesce queued writes (`nextWrite` scheduling) | Always (write path) | src/connection.js:250 |

### How each transpiler rewrites the above

**CJS (`transpile.cjs`)** — pure ESM→CommonJS syntax rewrite (`import`→`require`, `export`→`module.exports`). Node builtins are kept verbatim (`require('net')`, `require('crypto')`, …). No shims; runs on real Node only. This is the `exports.default` target.

**Cloudflare (`transpile.cf.js`)** — rewrites `net`/`tls`/`crypto`/`os`/`fs` imports and `perf_hooks`'s `performance` to `../polyfills.js`; prepends `import { setImmediate, clearImmediate }` and a `process` shim from polyfills when those tokens appear; `Buffer`→`node:buffer`; and turns every remaining bare builtin (`stream`) into `node:stream`. `cf/polyfills.js` provides: `crypto` over WebCrypto `globalThis.crypto.subtle` (randomBytes=`getRandomValues`, pbkdf2Sync=`deriveBits`, createHash/createHmac=`subtle.digest`/`subtle.sign`); `net.Socket` built on a dynamic `import('cloudflare:sockets')` (cf/polyfills.js:150); `tls.connect` via `raw.startTls()` (cf/polyfills.js:111); `net.isIP` via regex; `os.userInfo`→hardcoded `{username:'postgres'}`; `fs.readFile`→throws "Reading files not supported on CloudFlare"; `process`→`{ env: {} }`; `performance`→`globalThis.performance`.

**Deno (`transpile.deno.js`)** — rewrites `net`/`tls` to `../polyfills.js`; **drops** the `perf_hooks` import entirely (relies on Deno's global `performance`); maps `node:stream`→`std@0.132.0/node/stream.ts` and every other bare builtin (`crypto`, `os`, `fs`)→`std/node/$1.ts`; `Buffer`→`std/node/buffer.ts`, `process`→`std/node/process.ts`; replaces the `createHmac(...).digest()` call with std `HmacSha256`; rewrites `socket.setKeepAlive(true, 1000*keep_alive)`→`setKeepAlive(true)` (keep-alive interval dropped) and a `query.writable.push` tweak. `deno/polyfills.js` provides a hand-rolled `Socket` over `Deno.connect` (supports both `transport:'tcp'` **and** `transport:'unix'`, deno/polyfills.js:30-32) and `tls` over `Deno.startTls`; entry is `deno/mod.js` re-exporting `./src/index.js`.

### Runtime resolution (`package.json` "exports")
```
"types":   "./types/index.d.ts"
"bun":     "./src/index.js"      // Bun runs the untouched ESM source (Node-compatible builtins)
"workerd": "./cf/src/index.js"   // Cloudflare Workers → polyfilled tree
"import":  "./src/index.js"      // Node ESM
"default": "./cjs/src/index.js"  // Node CommonJS (require)
```
Resolution is first-match on the consuming runtime's conditions: Bun matches `bun`, Workers match `workerd`, Node `import`/`require` pick `src`/`cjs`. **Deno has no exports key** — it is consumed out-of-band via `https://deno.land/x/postgresjs/mod.js` (the separately built `deno/` tree), not through npm `exports`.

### Portability notes
- **Node (ESM `src/` and CJS `cjs/`)**: full feature set — TCP + unix sockets, SSL, md5 + SCRAM auth, `sql.file()`, large objects, COPY streams, logical replication (`subscribe.js`).
- **Bun**: served the raw `src/` ESM and works because Bun implements the Node builtins; behaves like Node.
- **Deno**: works via the std-lib `node/*` shims + `Deno.connect`/`Deno.startTls`; unix sockets supported. Caveats: keep-alive interval is dropped, `createHmac` is swapped for a std implementation, and it depends on pinned `deno.land/std@0.132.0` URLs (network-fetched, version-frozen).
- **Cloudflare Workers (workerd)**: TCP + STARTTLS only, via `cloudflare:sockets`. Things that **break / are degraded here**: `sql.file()` throws (no `fs`), `process.env` is an empty object (config must be passed explicitly), `os.userInfo()` is faked to `postgres`, no unix-socket transport, no real keep-alive (`net.Socket` has no `setKeepAlive`), default pool `max` forced to 3, and crypto is limited to what WebCrypto `subtle` supports (md5 via `subtle.digest('md5')` is non-standard and may fail on workerd). Auth digests become async (Promise-returning) and the code awaits them.
- **Common fragility**: portability is string-replacement based, so the shims must track the exact import statements in `src/` (e.g. `import net from 'net'`); any drift in source import style silently bypasses the rewrite. All variants still assume a `Buffer` global is available (polyfilled from `node:buffer` / Deno std).


## node-postgres — pg core

The pure-JS pg core has a small, lazily-loaded Node-builtin footprint: `events` is the only eagerly-required builtin everywhere; `net`/`tls`/`dns` are pulled in only at connect time (and routed through `lib/stream.js`, which swaps in Cloudflare's `pg-cloudflare` socket when it detects the Workers runtime); `crypto` is loaded for MD5/SCRAM auth but defensively falls back to WebCrypto/`globalThis.crypto`. Globals `process`, `Buffer`, and `globalThis` are used throughout for env/config, byte handling, and runtime detection. `fs`/`os` are never required directly in `pg/lib` (file reads for `.pgpass` are delegated to the optional third-party `pgpass` module).

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `events` (EventEmitter) | Base class for Client, Connection, Query, native variants — emits `connect`/`error`/`row`/`end` etc. | always (eager top-level require) | client.js:1, connection.js:3, query.js:3, native/query.js:3, native/client.js:12 |
| `net` | `new net.Socket()` for the plaintext TCP/unix-socket stream; `net.isIP()` to decide ALPN/SNI host handling for direct SSL | always for a real connection (lazy `require` inside `getStream`); `net.isIP` only on the SSL path | stream.js:22-23, connection.js:115-116 |
| `tls` | `tls.connect(options)` to upgrade the socket to TLS | only with SSL (lazy `require` inside `getSecureStream`) | stream.js:27-28 |
| `dns` | `dns.lookup(host)` to resolve host to an address (used by connection-parameters helper) | only when host resolution is requested | connection-parameters.js:3, connection-parameters.js:176 |
| `crypto` | `createHash('md5')` for MD5 auth; `webcrypto`/`subtle` for SHA-256/HMAC/PBKDF2 in SCRAM; random bytes | only during authentication (MD5 or SCRAM-SHA-256) | crypto/utils.js:1, crypto/utils.js:18, crypto/utils.js:32 |
| `crypto.webcrypto` / `globalThis.crypto` | WebCrypto fallback when `nodeCrypto.webcrypto` absent; SubtleCrypto for digests; MD5 via subtle when `createHash` throws (non-Node) | always evaluated at module load of crypto/utils; fallback path only on non-Node runtimes | crypto/utils.js:18, crypto/utils.js:38-45 |
| `util` | `util.inherits`/promisify-style helpers and inspection | always (eager) in client/native | client.js:3, native/query.js:4, native/client.js:1,13 |
| `util/types` (`isDate`) | Type-checking values when serializing query params | always (eager) | utils.js:5 |
| `pg-cloudflare` (`CloudflareSocket`) | Replacement Duplex socket + `startTls` for Workers (no `net`/`tls`) | only on Cloudflare Workers runtime (selected by `isCloudflareRuntime()`) | stream.js:41-48, stream.js:60-83 |
| `pg-protocol` | `parse`/`serialize` wire codec + `DatabaseError` | always (eager) | connection.js:5, index.js:10 |
| `pg-pool`, `pg-types`, `pg-connection-string` | Pooling, OID type parsers, conn-string parsing | always (eager) | index.js:8, type-overrides.js:3, result.js:3, defaults.js:85, connection-parameters.js:7 |
| `pg-native` (`Native`) | libpq-backed client | only when native client requested (try/catch optional require) | native/client.js:6-7 |
| `pgpass` | Read password from `.pgpass` file | only when password unset and pgpass lookup needed (deprecated path) | client.js:294 |
| global `process` | `process.env.PG*`/`PGSSLMODE`/`NODE_PG_FORCE_NATIVE`, `process.platform`, `process.nextTick`, `process.domain` | always (config, scheduling, domain binding) | defaults.js:5, connection-parameters.js:15,26,127, index.js:41, client.js:133+, query.js:25,144 |
| global `Buffer` | byte concat/slice/alloc for SCRAM proofs, salts, binary result decoding, param encoding | always during auth and binary I/O | crypto/sasl.js:108-254, crypto/utils.js:32,53, result.js:69, utils.js:27-54 |
| global `globalThis` / `navigator` / `Response` / `TextEncoder` | runtime detection (Workers) and encoding | always at module load (stream.js detection; crypto encoder) | stream.js:64-71, crypto/utils.js:18,24 |

### Portability notes
- **Node.js / Bun**: fully supported. `net`/`tls`/`dns`/`crypto` resolve to real builtins; `getNodejsStreamFuncs` is selected because `isCloudflareRuntime()` is false. Bun implements these builtins, so it works unchanged.
- **Cloudflare Workers (workerd)**: `isCloudflareRuntime()` (stream.js:60) detects the runtime via `navigator.userAgent === 'Cloudflare-Workers'` or the `Response({cf})` probe, and swaps the socket layer to `pg-cloudflare`'s `CloudflareSocket`, so `net`/`tls` are never required. Auth still works because crypto/utils.js prefers `globalThis.crypto`/SubtleCrypto and only falls back to `nodeCrypto.createHash` (note MD5 via WebCrypto subtle is used since Node's createHash is unavailable). `dns.lookup` (connection-parameters.js:176) and `pgpass`/native paths are not Worker-safe but are off the hot path.
- **Deno**: works through Node-compat (`node:net`, `node:tls`, `node:crypto`), though these bare specifiers (`require('net')` without the `node:` prefix) rely on Deno's bare-builtin shimming.
- **What breaks where**: the native client (`pg-native`/libpq) is Node-only and optional (try/catch). `.pgpass` support needs `fs` via the `pgpass` package and won't work on Workers/edge. Reliance on the global `process` (env, `nextTick`, `process.domain`) and bare (non-`node:`-prefixed) builtin specifiers are the main edge/ESM portability friction points for a new driver to avoid.


## node-postgres — pg-protocol (purity check)

pg-protocol is effectively RUNTIME-PURE: it depends only on the global `Buffer` (and `console.error` for one warning). The single Node-builtin import (`stream`) is a **type-only** import (`TransformOptions`) that TypeScript erases at compile time — there is no `net`, `tls`, `fs`, `crypto`, `dns`, `os`, `child_process`, or native binding anywhere. The parser/serializer operate purely on byte buffers and a callback, so the protocol core is portable to any runtime that provides a `Buffer` polyfill.

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `Buffer` (global) | All wire encode/decode: allocation, slicing, `readUInt32BE`/`writeInt32BE`, `Buffer.byteLength`, `Buffer.from`/`allocUnsafe` | always (core of both parser and serializer) | buffer-reader.ts:2,9,53; buffer-writer.ts:4,8,18,43,68,81,90-93; serializer.ts:21-256 (e.g. 39,178,189,192,202,220,252); parser.ts:47,81,94,100-102,140-144; messages.ts:127,190 |
| `stream` (`TransformOptions`) — Node builtin | **Type only**: `type StreamOptions = TransformOptions & { mode }` for the `Parser` constructor's optional opts | always at type-check, but ERASED at runtime (TS `import type`-style elision; `Parser` does NOT extend `Transform`, it's a plain class with a `.parse(buffer, cb)` method) | parser.ts:1, used at parser.ts:49,87 |
| `NodeJS.ReadableStream` (global TS namespace) | **Type only**: parameter annotation on the convenience `parse(stream, callback)` helper; the body uses duck-typed `stream.on('data'|'end')` (EventEmitter shape) | always at type-check, erased at runtime | index.ts:5,6,8 |
| `console.error` (global) | Emits a warning when a prepared-statement name exceeds Postgres' 63-char limit | only when serializing a Parse message with an over-long statement name | serializer.ts:81 |
| `assert`, `stream` (`PassThrough`), `BufferList`, test buffers | Test scaffolding only | only when running the package's own unit tests | inbound-parser.test.ts:1,4,5; outbound-serializer.test.ts:1; testing/* |

Notes on what is NOT present (verified by grep over `*.ts` excluding tests): no `require('net')`, `require('tls')`, `require('fs')`, `require('crypto')`, `require('dns')`, `require('os')`, `require('child_process')`, no native addon, no `process.*`, no `globalThis`, no `global.*`. SCRAM/SSL handling lives in `pg/lib` (client/crypto), not here — pg-protocol only serializes the SASL/SSL-request bytes it is handed (serializer.ts:38-58) and never imports a crypto module.

### Portability notes
- **Node.js**: works as-is. `Buffer`, `console`, and the type-only `stream`/`NodeJS` references are all native.
- **Bun**: works as-is — Bun provides a Node-compatible global `Buffer` and `console`; the `stream` import is erased so no `node:stream` shim is even needed at runtime.
- **Deno**: works with a `Buffer` polyfill (Deno exposes `Buffer` via `node:buffer` / `Deno.Buffer`-compat or the std node-compat layer). Because the only runtime global is `Buffer`, the surface to polyfill is tiny. The `stream` type import never reaches the JS output.
- **Cloudflare Workers / workerd**: this is the key win — the protocol core has NO net/tls/socket dependency, so the parser+serializer run unmodified given a `Buffer` polyfill (Workers' `nodejs_compat` flag provides `Buffer`). The actual socket I/O is supplied externally (e.g. pg-cloudflare's socket adapter feeds bytes into `Parser.parse` and writes `serialize()` output). The `index.ts` `parse(NodeJS.ReadableStream, cb)` helper assumes an EventEmitter-style stream and would not be used on Workers, but the underlying `Parser` class (which only needs `.parse(buffer, cb)`) is fully portable.
- **What could break**: only the absence of a global `Buffer`. There is no fallback to `Uint8Array`/`DataView`, so a runtime without a Buffer polyfill (a bare browser without bundler shims) would fail. The lone `console.error` (serializer.ts:81) is benign and present in every target runtime.
- **Design takeaway for the new driver**: pg-protocol demonstrates a cleanly portable wire layer — keep protocol encode/decode dependent only on a byte-buffer abstraction and a message callback, push all `net`/`tls`/`crypto`/socket concerns into a separate transport layer. To go even more portable than pg-protocol, swap `Buffer` for `Uint8Array` + `DataView` to drop the last runtime dependency.


## node-postgres — pg-native (libpq)

`pg-native` is a thin JS wrapper over the **`libpq` npm addon** — a node-gyp-compiled C++ binding to PostgreSQL's official `libpq` client library. When this path is active, the **entire wire protocol, connection setup, SSL/TLS, SCRAM auth, parameter binding and result decoding happen inside the compiled C library**, not in JS — so `pg-protocol`, `pg/lib/connection.js` and the JS socket/`tls` stack are bypassed entirely. The JS surface only marshals calls in/out of libpq and decodes text-format cell values via `pg-types`. Its runtime footprint is therefore: a native compiled `.node` addon + the host's system `libpq`/OpenSSL, plus a few Node core modules for the event/stream glue.

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `libpq` (native addon) | The actual Postgres client: TCP/unix-socket connect, SSL, SCRAM/MD5 auth, protocol framing, query exec, result buffers, COPY, cancel, escape, notifications. All `this.pq.*` calls delegate here. | Always, the moment `pg-native` is `require`d (native path only) | `pg-native/index.js:1` (`require('libpq')`), used at `index.js:21,50,54,66,70,83,96,106,115,123,125,128,134,139,145,149,153,161,...` |
| `events` (`EventEmitter`) | `Client` extends EventEmitter; emits `result`/`readyForQuery`/`notification`/`error`; listens for libpq `readable` | Always (native path) | `pg-native/index.js:2,20,47` |
| `util` (`util.inherits`) | Prototype inheritance wiring for `Client` and `CopyStream` | Always (native path) | `pg-native/index.js:3,47`; `lib/copy-stream.js:3,11` |
| `assert` | Guard that `cancel()` is given a callback | Only when `client.cancel()` is called | `pg-native/index.js:4,113` |
| `pg-types` | Default text-format result parsers (`getTypeParser`) for decoding cell values returned by libpq | Always, unless caller passes `config.types`; invoked per-field in `build-result` | `pg-native/index.js:5,26`; `lib/build-result.js:34,68` |
| `./lib/build-result` | Builds `{command,rowCount,fields,rows}` from libpq result handle (`nfields/ftype/getvalue/getisnull/ntuples`) | On every completed result (sync + async) | `pg-native/index.js:6,129,141,178` |
| `./lib/copy-stream` (`CopyStream`) | Duplex stream over libpq `putCopyData/getCopyData/putCopyEnd` for COPY IN/OUT | Only when `client.getCopyStream()` is called | `pg-native/index.js:7,108`; `lib/copy-stream.js` |
| `stream` (`Duplex`,`Writable`) | Base classes for the COPY stream | Only with COPY (when `getCopyStream()` used) | `lib/copy-stream.js:1,2` |
| global `Buffer` | Type-check COPY-OUT chunks returned by `pq.getCopyData` (`result instanceof Buffer`) | Only during COPY OUT reads | `lib/copy-stream.js:74` |
| `./package.json` | Expose `pg-native` version (checked by node-postgres) | Always (module load) | `pg-native/index.js:157` |

### How/when the native path is triggered (from `pg`)
- `require('pg').native` — lazy getter that does `new PG(require('./native'))`; swallows `MODULE_NOT_FOUND` so a missing addon yields `native === null` rather than crashing. `pg/lib/index.js:53-73`.
- `process.env.NODE_PG_FORCE_NATIVE` — forces native as the default client constructor; wrapped in try/catch for "Deno without --allow-env". `pg/lib/index.js:40-48`.
- `pg/lib/native/client.js:5-10` does `require('pg-native')` inside a try/catch (comment: avoid bundler complaints about an optional import), which is the bridge into this package. Also uses `util` (`util.deprecate`) and `process.nextTick` throughout (`client.js:1,12,18,68,90,196,223,231,269`).
- `libpq` itself is a peer/transitive dependency declared in `pg-native/package.json:37` (`"libpq": "^1.8.15"`), NOT bundled — it must be compiled/installed at the consumer.

### Portability notes
- **Build-time requirement (the big one):** `libpq` is a node-gyp native addon. Installing it requires a C/C++ toolchain (compiler, `node-gyp`, Python), the PostgreSQL client dev headers/`libpq` (`libpq-dev` / `pg_config` on PATH) and Node headers. `node-gyp >=10` and `semver` are even listed as devDeps (`package.json:46,48`). On machines without a compiler or without system `libpq`, `require('pg-native')`/`require('libpq')` fails at install or at first `require` — which is exactly why `pg` wraps the require in try/catch and treats `MODULE_NOT_FOUND` as "native unavailable" (`pg/lib/index.js:60-64`).
- **Node only.** The compiled `.node` binary targets a specific Node ABI (N-API/nan) + OS + CPU arch. It does not run on **Cloudflare Workers / `workerd`** or any non-Node serverless V8-isolate runtime (no native addon loading, no filesystem `.node`, no child process/FFI of this kind). It also won't load in browser/edge bundles.
- **Bun / Deno:** technically can load some N-API addons, but this path is fragile and unsupported in practice — Deno needs `--allow-env`/`--allow-ffi`-style permissions (note the explicit Deno caveat at `pg/lib/index.js:42`), and any ABI/arch mismatch breaks it. The maintained, portable path on these runtimes is the **pure-JS** driver (`pg-protocol` + JS sockets), not pg-native.
- **Serverless / containers:** even where it can build, you must ship the platform-matching prebuilt binary (or build in the same base image) and have system `libpq`/OpenSSL present at runtime. Cross-compiling locally (e.g. macOS arm64) then deploying to Linux x64 lambda will fail to load. This deployment friction is the main reason the native path is niche.
- **What you gain by paying that cost:** TLS, SCRAM/MD5 auth, unix-socket support, connection params parsing and protocol handling are all delegated to battle-tested C `libpq`, so JS-side has *zero* `net`/`tls`/`crypto` dependencies — contrast with the pure-JS client which needs `net`,`tls`,`crypto`,`dns`. The trade is full loss of edge/serverless portability.


## node-postgres — pg-cloudflare (Workers socket)

`pg-cloudflare` is a tiny shim that wraps the workerd `cloudflare:sockets` API in a `net.Socket`-like, `EventEmitter`-based surface so `pg`'s `Connection` can drive it unchanged. Its only Node runtime dependencies are `events` (EventEmitter) and the global `Buffer`/`TextDecoder`; everything else is the workerd-provided `cloudflare:sockets` module. `pg/lib/stream.js` runtime-detects Cloudflare Workers and swaps `net.Socket`/`tls.connect()` for `CloudflareSocket`; the package's own `exports` map serves the real code only under the `workerd` condition and ships `empty.ts` (`export default {}`) everywhere else.

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `cloudflare:sockets` (workerd builtin) | `connect()` to open a raw/starttls socket; `Socket.startTls()`, `.writable.getWriter()`, `.readable.getReader()`, `.closed`, `.close()` | only on workerd — `CloudflareSocket` is only instantiated when `isCloudflareRuntime()` is true; `connect` is also lazily `await import('cloudflare:sockets')`'d at connect time | `src/index.ts:1` (type import), `src/index.ts:40-42` (dynamic import + connect); used at `:43,46,131-133,139,110` |
| `events` (`EventEmitter`) | Base class so `CloudflareSocket` emits `connect`/`data`/`close`/`error` like a `net.Socket` | always (when the CF module is loaded under workerd) | `src/index.ts:2,7` |
| global `Buffer` | Wrap inbound `Uint8Array` chunks (`Buffer.from(value)`), encode string writes, `Buffer.alloc(0)` default for `end()`, hex dump in debug `log` | always (when CF module loaded); workerd provides a `Buffer` polyfill via `nodejs_compat` | `src/index.ts:74,82,91,107,157` |
| global `TextDecoder` | Debug-only: decode bytes to a string in `dump()` | only when `debug === true` (hardcoded `false` at `:152`) | `src/index.ts:160` |
| `net` (`require('net')`) | `new net.Socket()` for the normal Node path | only in non-Cloudflare runtime (Node/Bun/Deno) — `getNodejsStreamFuncs().getStream` | `pg/lib/stream.js:22` |
| `tls` (`require('tls')`) | `tls.connect(options)` for SSL on the Node path | only in non-Cloudflare runtime AND only with SSL | `pg/lib/stream.js:27` |
| `pg-cloudflare` (`require('pg-cloudflare')`) | Obtain `CloudflareSocket` for the Workers path | only on workerd (gated by `isCloudflareRuntime()`) | `pg/lib/stream.js:41` |
| global `navigator` | Runtime detection: `navigator.userAgent === 'Cloudflare-Workers'` | always (read at module load via `getStreamFuncs()`) | `pg/lib/stream.js:64,66` |
| global `Response` (+ `cf` property) | Fallback runtime detection when `navigator.userAgent` absent | only when `navigator`/`userAgent` is undefined | `pg/lib/stream.js:69-71` |

### Portability notes
- **stream.js dispatch is the linchpin.** `getStreamFuncs()` runs once at module load (`stream.js:1`) and picks Cloudflare vs Node funcs via `isCloudflareRuntime()` (`:60-76`). Detection is workerd-specific: `navigator.userAgent === 'Cloudflare-Workers'` (set by the `global_navigator` compat flag) with a `new Response(null,{cf:{thing:true}})` fallback. On Node/Bun/Deno both checks fail, so it uses `net.Socket` + `tls.connect()` and `pg-cloudflare` is never `require`d.
- **Workers (workerd):** works. The package `exports` map serves real code only under the `workerd` condition; `connect` is `await import('cloudflare:sockets')`'d lazily (`index.ts:40`) so the module reference can't be statically hoisted/bundled into non-worker builds. Requires `nodejs_compat` for `Buffer` and `EventEmitter` (`events`). TLS is done in-band via `startTls()` (the socket opens with `secureTransport: 'starttls'` at `:39`, then `getSecureStream` calls `options.socket.startTls(options)` — `stream.js:46-48`), not Node `tls`.
- **Empty fallback prevents bundler breakage.** Outside workerd, importing `pg-cloudflare` resolves to `empty.ts` (`export default {}`), so bundlers for Node/browser don't try to resolve the unresolvable `cloudflare:sockets` builtin. The cost: on non-workerd runtimes `require('pg-cloudflare')` would yield `{}` with no `CloudflareSocket` — but that path is never taken because `isCloudflareRuntime()` gates it.
- **What breaks where:** `cloudflare:sockets` exists only on workerd, so the CF path is a hard error anywhere else; conversely `net`/`tls` don't exist on workerd, so the Node path can't run there. The two are mutually exclusive by design. `CloudflareSocket` only implements the subset `pg` uses (`setNoDelay`/`setKeepAlive`/`ref`/`unref` are no-ops returning `this`, `:21-32`); anything depending on richer `net.Socket` semantics (e.g. unix-socket paths, `connection.connect(path)`) won't work on Workers.
- **Design takeaway for a new driver:** a single `EventEmitter`-shaped socket interface (connect/write/end/destroy + `data`/`connect`/`close`/`error` events) plus a per-runtime factory is enough to span Node and Workers; keep the runtime-specific import dynamic (`await import`) and behind a runtime probe, and provide an empty module for the non-native condition to keep bundlers happy.


## node-postgres — pool / cursor / query-stream / connection-string

These satellite packages have a very light Node-builtin footprint: `events` (EventEmitter) is the only hard, always-loaded builtin (pulled by `pg-pool` and `pg-cursor`), `stream.Readable` is the always-loaded builtin for `pg-query-stream`, `util` is always pulled by `pg-cursor` (for `util.inherits`), and `fs` is loaded by `pg-connection-string` **only** when file-backed SSL options are present. No package touches the global `Buffer`; `process` is used only via `process.nextTick` (pool) and a guarded `process.emitWarning` (connection-string).

| Dependency | Used for | Circumstance (when pulled in) | Where |
|---|---|---|---|
| `events` (EventEmitter) | Pool extends EventEmitter to emit `connect`/`acquire`/`release`/`remove`/`error` | always (top-level require) | pg-pool/index.js:2 |
| `pg` (`require('pg').Client`) | Default Client class for spawning pooled connections | only when caller did not pass `options.Client`/global `Client` — lazy fallback inside constructor | pg-pool/index.js:95 |
| `process` (`process.nextTick`) | Defer `_pulseQueue` so queue draining is async | always (global, used on every pulse path) | pg-pool/index.js:203 |
| `pg/lib/result.js` | Build `Result` rows for each cursor `read()` batch | always | pg-cursor/index.js:3 |
| `pg/lib/utils.js` (`prepareValue`) | Serialize bound parameter values for the cursor's Bind | always | pg-cursor/index.js:4 |
| `events` (EventEmitter) | Cursor extends EventEmitter (inherited via `util.inherits`) | always | pg-cursor/index.js:5 |
| `util` (`util.inherits`) | Wire Cursor's prototype chain to EventEmitter | always | pg-cursor/index.js:6 |
| `stream` (`Readable`) | QueryStream subclasses `Readable` to expose row stream | always (top-level import) | pg-query-stream/src/index.ts:1 |
| `pg` (types `Submittable`, `Connection`) | Type-only import for Submittable contract | always (compile-time; erased at runtime) | pg-query-stream/src/index.ts:2 |
| `pg-cursor` | Underlying paged reader that QueryStream pumps from | always | pg-query-stream/src/index.ts:3 |
| `fs` (`readFileSync`) | Read `sslcert`/`sslkey`/`sslrootcert` files into `config.ssl.{cert,key,ca}` | only when at least one of `config.sslcert`/`sslkey`/`sslrootcert` is set (ternary-guarded `require('fs')`) | pg-connection-string/index.js:88,91,95,99 |
| `process` (`process.emitWarning`) | Emit one-time security warning for deprecated SSL modes (`prefer`/`require`/`verify-ca`) | only when such an SSL mode is parsed AND `process`/`process.emitWarning` exist (typeof-guarded) | pg-connection-string/index.js:220,222 |

### Portability notes
- **pg-connection-string** is the most portable: its only builtin (`fs`) is behind a runtime ternary that fires solely when file-path SSL options are given, and its `process.emitWarning` use is `typeof process !== 'undefined'`-guarded (pg-connection-string/index.js:220). So in a browser/Workers/edge runtime it parses connection URLs fine as long as you do not pass `sslcert`/`sslkey`/`sslrootcert` (which would require `fs` and throw where it is unavailable). It never touches `Buffer`.
- **pg-pool** needs `events` (available/polyfilled in Node, Bun, Deno, and most Workers shims) and `process.nextTick` (present in Node/Bun/Deno; on Workers it requires the `nodejs_compat` process shim). The `require('pg').Client` fallback (pg-pool/index.js:95) only drags in the full `pg` Client tree if you do not inject your own `Client`, so an edge-friendly Client can be supplied to keep the pool lean.
- **pg-cursor** hard-requires `util.inherits` and `events`, plus reaches into `pg/lib/result.js` and `pg/lib/utils.js`; it runs on Node/Bun/Deno but inherits whatever portability the core `pg` Client/Connection has. `util` is the main friction point on non-Node runtimes lacking a `util` shim.
- **pg-query-stream** depends on `stream.Readable`; this works on Node/Bun/Deno and on Workers only with the `nodejs_compat` `stream` polyfill. It adds no new builtins beyond `stream` (it composes `pg-cursor`), so its portability is bounded by `pg-cursor` + a working `Readable`.
- None of the four satellites use the global `Buffer` directly, so Buffer-polyfill availability is not a concern for these packages specifically (it is for the core `pg`/`pg-protocol` they sit on top of).
