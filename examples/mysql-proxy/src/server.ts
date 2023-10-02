import * as mysql from 'mysql2/promise';
import express from 'express';

const app = express();
app.use(express.json());
const port = 3000;

const main = async () => {
const connection = await mysql.createConnection('mysql://root:mysql@127.0.0.1:5432/drizzle');

app.post('/query', async (req, res) => {
	const { sql: sqlBody, params, method } = req.body;

	if (method === 'all') {
		try {
            const result = await connection.query({
                sql: sqlBody,
                values: params,
                rowsAsArray: true,
                typeCast: function(field: any, next: any) {
                    if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
                        return field.string();
                    }
                    return next();
                },
            });
			res.send(result[0]);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else if (method === 'execute') {
		try {
            const result = await connection.query({
                sql: sqlBody,
                values: params,
                typeCast: function(field: any, next: any) {
                    if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
                        return field.string();
                    }
                    return next();
                },
            });

			res.send(result);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else {
		res.status(500).json({ error: 'Unknown method value' });
	}
});

app.post('/migrate', async (req, res) => {
	const { queries } = req.body;

    await connection.query('BEGIN');
    try {
        for (const query of queries) {
            await connection.query(query);
        }
        await connection.query('COMMIT');
    } catch {
        await connection.query('ROLLBACK');
    }

	res.send({});
});

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
}

main();
