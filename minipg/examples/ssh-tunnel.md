# Connecting through an SSH tunnel (bastion / jump host)

minipg stays pure `node:net`/`tls`/`crypto` — it has **no SSH dependency**. To reach a Postgres
behind a bastion, you bring an SSH client (e.g. [`ssh2`](https://www.npmjs.com/package/ssh2)) and
hand minipg the **forwarded stream** via the `socket` hook.

The hook may return the stream **synchronously or as a `Promise`**, and it's called on every
(re)connect — so async transports like `ssh2.forwardOut` work, and a fresh forward is opened on
each reconnect.

```ts
import { readFileSync } from 'node:fs'
import type { Duplex } from 'node:stream'
import { Client as SSH } from 'ssh2'      // npm i ssh2  (a peer of YOUR app, not of minipg)
import { connect } from 'minipg'

// 1. Open the SSH connection to the bastion.
const ssh = new SSH()
await new Promise<void>((resolve, reject) => {
  ssh.once('ready', resolve).once('error', reject).connect({
    host: 'bastion.example.com',
    port: 22,
    username: 'deploy',
    privateKey: readFileSync(`${process.env.HOME}/.ssh/id_ed25519`),
  })
})

// 2. minipg calls socket() per (re)connect; forward bastion -> the private DB host:port.
const db = await connect({
  user: 'app',
  database: 'app',
  password: process.env.PGPASSWORD,
  socket: () =>
    new Promise<Duplex>((resolve, reject) =>
      // forwardOut(srcAddr, srcPort, dstHost, dstPort, cb) -> a Duplex channel to the DB
      ssh.forwardOut('127.0.0.1', 0, 'db.internal', 5432, (err, stream) =>
        err ? reject(err) : resolve(stream as unknown as Duplex),
      ),
    ),
  // The SSH channel is already encrypted, so PostgreSQL TLS is usually redundant here (the
  // default ssl:false). If your security policy requires end-to-end TLS *through* the tunnel,
  // pass an ssl object too — verification runs over the forwarded stream like any other socket:
  //   ssl: { ca: readFileSync('db-ca.pem'), servername: 'db.internal', rejectUnauthorized: true },
})

const { rows } = await db.query('select now() as t')
console.log(rows)

await db.end()
ssh.end()
```

## Notes
- **Reconnect:** with `reconnect: true`, minipg calls `socket()` again on each retry, so it opens a
  fresh `forwardOut` channel — the tunnel survives DB restarts as long as the SSH connection is up.
  (Keep the `ssh` client alive for the lifetime of the pool/connection.)
- **Pools:** `createPool({ socket: () => ssh.forwardOut(...) })` works the same — each pooled
  connection opens its own forwarded channel.
- **Local port-forward alternative:** if you'd rather run `ssh -L 6543:db.internal:5432 bastion`
  out of band, just point minipg at the local end with no hook: `connect({ host: '127.0.0.1', port: 6543 })`.
- **Unix socket on the same host:** unrelated to SSH, but for a local server use `connect({ path: '/var/run/postgresql/.s.PGSQL.5432' })` (lower latency than TCP).
```
