import type { Connection, Pool } from '@drizzle-team/minipg';
import type * as copy from 'minipg-copy';

declare const pool: Pool;
declare const connection: Connection;
declare const copyPool: copy.Pool;
declare const copyConnection: copy.Connection;

export const standaloneClients: (copy.Pool | copy.Connection)[] = [pool, connection];
export const copyClients: (Pool | Connection)[] = [copyPool, copyConnection];
