import { query } from './query.js';

console.log(JSON.stringify(await query(process.env.PG_CONNECTION_STRING)));
