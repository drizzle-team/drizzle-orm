import net from 'node:net';

/**
 * Test-only loopback TCP proxy in front of Postgres, scoped to one runtime's walsender
 * connection. Classifies the active WAL connection by sniffing the StartupMessage for the
 * `replication` parameter (present only on the walsender, not the admin pool) so
 * dropClient() always targets the right socket even across reconnects.
 */
export function startWalProxy(targetHost: string, targetPort: number) {
  let activeClient: net.Socket | null = null;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    sockets.add(client);
    sockets.add(upstream);
    client.on('error', () => {});
    upstream.on('error', () => {});

    // Classify only once the whole StartupMessage is in hand — a bare first chunk can split the
    // message mid-parameter (or land only the leading length prefix), and "replication" straddling
    // a TCP segment boundary must not silently fall through to admin classification. Later chunks
    // on an admin-pool connection can coincidentally contain the byte sequence "replication" (e.g.
    // a query against pg_replication_slots) and must not be allowed to steal activeClient, so
    // classification is one-shot once the full startup message is assembled.
    let classified = false;
    let startupChunks: Buffer[] = [];
    let startupBytesSeen = 0;
    let startupLength: number | null = null;

    client.on('data', (chunk) => {
      if (!classified) {
        startupChunks.push(chunk);
        startupBytesSeen += chunk.length;
        const startup = Buffer.concat(startupChunks);
        if (startupLength === null && startupBytesSeen >= 4) {
          startupLength = startup.readInt32BE(0);
        }
        // Bail out past any sane StartupMessage size so a malformed/non-startup lead-in can't
        // grow this buffer unboundedly.
        if (
          (startupLength !== null && startupBytesSeen >= startupLength) ||
          startupBytesSeen > 65536
        ) {
          classified = true;
          if (startup.includes('replication')) {
            activeClient = client;
          }
          startupChunks = [];
        }
      }
      upstream.write(chunk);
    });

    upstream.pipe(client);

    const cleanup = (): void => {
      sockets.delete(client);
      sockets.delete(upstream);
      if (activeClient === client) activeClient = null;
    };
    client.on('close', () => {
      upstream.destroy();
      cleanup();
    });
    upstream.on('close', () => {
      client.destroy();
      cleanup();
    });
  });

  return {
    listen: (): Promise<number> =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as net.AddressInfo).port);
        });
      }),
    dropClient: (): void => {
      activeClient?.destroy();
    },
    close: (): Promise<void> =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

export function proxiedDatabaseUrl(baseUrl: string, port: number): string {
  const url = new URL(baseUrl);
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return url.toString();
}
