import { connect } from 'drizzle-orm';

import { MySqlTestConnector } from '~/testing';
import { cities, classes, users } from './tables';

export const db = await connect(new MySqlTestConnector({ users, cities, classes }));
