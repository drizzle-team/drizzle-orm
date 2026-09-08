import { Readable, type Writable } from 'node:stream';

// JSON output is often longer than 64 kb, so we need to use streams to write it to stdout
// in order to avoid truncation when piping to other commands.
export async function write(data: string, out: Writable): Promise<void> {
	return new Promise((resolve, reject) => {
		const stream = new Readable({
			read() {
				this.push(data);
				this.push('\n');
				this.push(null);
			},
		});

		stream.on('data', (chunk) => {
			out.write(chunk);
		});

		stream.on('end', () => {
			resolve();
		});

		out.on('error', (err) => {
			reject(err);
		});
	});
}
