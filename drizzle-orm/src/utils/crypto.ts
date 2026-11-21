export async function computeHash(data: string): Promise<string> {
	const encoder = new TextEncoder();
	const encodedData = encoder.encode(data);
	const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData);
	const hashArray = [...new Uint8Array(hashBuffer)];
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
