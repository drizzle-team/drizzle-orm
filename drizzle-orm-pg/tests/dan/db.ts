import { PgTestConnector } from '~/testing';

export const db = new PgTestConnector().connect();
