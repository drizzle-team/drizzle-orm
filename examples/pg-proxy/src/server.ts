import { Client } from 'pg';
import express from 'express';

const app = express();
app.use(express.json());
const port = 3000;

const client = new Client('postgres://postgres:postgres@localhost:5432/postgres');

app.post('/query', async (req, res) => {
	const { sql: sqlBody, params, method } = req.body;

	if (method === 'all') {
		try {
            const result = await client.query({
                text: sqlBody,
                values: params,
                rowMode: 'array',
            });
			res.send(result.rows);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else if (method === 'execute') {
		try {
            const result = await client.query({
                text: sqlBody,
                values: params,
            });

			res.send(result.rows);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else {
		res.status(500).json({ error: 'Unknown method value' });
	}
});

app.post('/migrate', async (req, res) => {
	const { queries } = req.body;

    await client.query('BEGIN');
    try {
        for (const query of queries) {
            await client.query(query);
        }
        await client.query('COMMIT');
    } catch {
        await client.query('ROLLBACK');
    }

	res.send({});
});

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
