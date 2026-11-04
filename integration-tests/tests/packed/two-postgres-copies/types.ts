import type { Connection, Pool } from '@drizzle/postgres';
import type * as copy from 'postgres-copy';

declare const pool: Pool;
declare const connection: Connection;
declare const copyPool: copy.Pool;
declare const copyConnection: copy.Connection;

export const standaloneClients: (copy.Pool | copy.Connection)[] = [pool, connection];
export const copyClients: (Pool | Connection)[] = [copyPool, copyConnection];
