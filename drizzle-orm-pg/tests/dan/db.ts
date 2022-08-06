import { connect } from 'drizzle-orm';

import { PgTestConnector } from '~/testing';
import { cities, classes, users } from './tables';

export const db = await connect(new PgTestConnector({ users, cities, classes }));
