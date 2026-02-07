import type { APIRoute } from 'astro';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

export const POST: APIRoute = async ({ request }) => {
	try {
		const { markdown } = await request.json();

		if (!markdown) {
			return new Response('Markdown content is required', { status: 400 });
		}

		// Convert markdown to HTML
		const htmlContent = marked(markdown);

		// Create the full HTML document with styling
		const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			line-height: 1.7;
			color: #1f2937;
			padding: 40px 50px;
			max-width: 800px;
			margin: 0 auto;
		}

		h1 {
			font-size: 2rem;
			font-weight: 700;
			margin-bottom: 1rem;
			color: #111827;
			border-bottom: 2px solid #e5e7eb;
			padding-bottom: 0.5rem;
		}

		h2 {
			font-size: 1.5rem;
			font-weight: 600;
			margin-top: 2rem;
			margin-bottom: 0.75rem;
			color: #111827;
		}

		h3 {
			font-size: 1.25rem;
			font-weight: 600;
			margin-top: 1.5rem;
			margin-bottom: 0.5rem;
			color: #1f2937;
		}

		h4 {
			font-size: 1.1rem;
			font-weight: 600;
			margin-top: 1.25rem;
			margin-bottom: 0.5rem;
			color: #374151;
		}

		p {
			margin-bottom: 1rem;
		}

		a {
			color: #6366f1;
			text-decoration: underline;
		}

		ul, ol {
			margin-bottom: 1rem;
			padding-left: 1.5rem;
		}

		li {
			margin-bottom: 0.25rem;
		}

		code {
			background: #f3f4f6;
			padding: 0.125rem 0.375rem;
			border-radius: 4px;
			font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
			font-size: 0.875em;
			color: #dc2626;
		}

		pre {
			background: #1f2937;
			color: #e5e7eb;
			padding: 1rem;
			border-radius: 8px;
			margin-bottom: 1rem;
			overflow-x: auto;
		}

		pre code {
			background: transparent;
			color: #e5e7eb;
			padding: 0;
		}

		blockquote {
			border-left: 4px solid #6366f1;
			padding-left: 1rem;
			margin: 1rem 0;
			color: #6b7280;
			font-style: italic;
		}

		hr {
			border: none;
			border-top: 1px solid #e5e7eb;
			margin: 2rem 0;
		}

		table {
			width: 100%;
			border-collapse: collapse;
			margin: 1rem 0;
		}

		th, td {
			padding: 0.75rem;
			border: 1px solid #e5e7eb;
			text-align: left;
		}

		th {
			background: #f9fafb;
			font-weight: 600;
		}

		img {
			max-width: 100%;
			height: auto;
			border-radius: 8px;
			margin: 1rem 0;
		}

		@page {
			margin: 2cm;
		}
	</style>
</head>
<body>
	${htmlContent}
</body>
</html>
		`.trim();

		// Launch Puppeteer
		const browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		});

		const page = await browser.newPage();

		// Set the HTML content
		await page.setContent(html, { waitUntil: 'networkidle0' });

		// Generate PDF
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: {
				top: '2cm',
				right: '2cm',
				bottom: '2cm',
				left: '2cm',
			},
		});

		await browser.close();

		// Return the PDF
		return new Response(pdfBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="document-${Date.now()}.pdf"`,
			},
		});
	} catch (error) {
		return new Response('Failed to generate PDF', { status: 500 });
	}
};
