import { Client } from 'pg';
import { PgConnector } from '~/index';

export const db = await new PgConnector(new Client()).connect();
