import { Client } from 'pg';
import { PgConnector } from '~/connector';

export const db = await new PgConnector(new Client()).connect();
