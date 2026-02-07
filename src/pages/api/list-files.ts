import type { APIRoute } from 'astro';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export const POST: APIRoute = async ({ request }) => {
	try {
		const { folderPath } = await request.json();

		if (!folderPath) {
			return new Response('Folder path is required', { status: 400 });
		}

		// List files in the directory
		const files = readdirSync(folderPath);
		const markdownFiles = files
			.filter((file) => file.endsWith('.md') || file.endsWith('.markdown'))
			.map((file) => {
				const fullPath = join(folderPath, file);
				const stats = statSync(fullPath);
				return {
					name: file,
					path: fullPath,
					size: stats.size,
					modified: stats.mtime,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));

		return new Response(JSON.stringify({ files: markdownFiles }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Failed to list files',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
