import Database from 'better-sqlite3';
import express from 'express';

const app = express();
app.use(express.json());
const port = 3000;

const db = new Database('./test.db');

app.post('/query', (req, res) => {
	const { sql: sqlBody, params, method } = req.body;

	if (method === 'run') {
		try {
			const result = db.prepare(sqlBody).run(params);
			res.send(result);
		} catch (e: any) {
			res.status(500).json({ error: e.message });
		}
	} else if (method === 'all' || method === 'values') {
		try {
			const rows = db.prepare(sqlBody).raw().all(params);
			res.send(rows);
		} catch (e: any) {
			res.status(500).json({ error: e.message });
		}
	}else if (method === 'get') {
		try {
			const row = db.prepare(sqlBody).raw().get(params);
			return { data: row };
		} catch (e: any) {
			return { error: e.message };
		}
	} else {
		res.status(500).json({ error: 'Unkown method value' });
	}
});

app.post('/migrate', (req, res) => {
	const { queries } = req.body;

	db.exec('BEGIN');
	try {
		for (const query of queries) {
			db.exec(query);
		}
		db.exec('COMMIT');
	} catch (e: any) {
		db.exec('ROLLBACK');
	}
	
	res.send({});
});

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
