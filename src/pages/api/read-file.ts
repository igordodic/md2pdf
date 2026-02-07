import type { APIRoute } from 'astro';
import { readFileSync } from 'fs';

export const POST: APIRoute = async ({ request }) => {
	try {
		const { filePath } = await request.json();

		if (!filePath) {
			return new Response('File path is required', { status: 400 });
		}

		// Read the file content
		const content = readFileSync(filePath, 'utf-8');

		return new Response(JSON.stringify({ content }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Failed to read file',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
