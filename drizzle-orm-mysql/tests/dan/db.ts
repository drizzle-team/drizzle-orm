import { createPool } from 'mysql2/promise';
import { MySqlConnector } from '~/mysql2/connector';

export const db = await new MySqlConnector(createPool({})).connect();
