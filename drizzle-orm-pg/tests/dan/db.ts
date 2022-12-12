import { Client } from 'pg';
import { connect } from '~/node';

export const db = await connect(new Client());
