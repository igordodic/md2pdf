import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import './MarkdownEditor.css';

interface MarkdownFile {
	name: string;
	file?: File;
	path?: string;
	size: number;
	modified?: Date;
}

interface MarkdownEditorProps {}

// Configure marked options
marked.setOptions({
	breaks: true,
	gfm: true,
});

export default function MarkdownEditor({}: MarkdownEditorProps) {
	const [markdown, setMarkdown] = useState(`# Welcome to MD2PDF

## Start typing your Markdown here...

This is a **simple** and *modern* Markdown to PDF converter.

### Features

- Live preview of your Markdown
- Clean PDF export
- No account required

### Code Example

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

### Lists

1. First item
2. Second item
3. Third item

### Blockquotes

> This is a blockquote
> It can span multiple lines

---

**Enjoy converting your Markdown to PDF!**
`);

	const [currentFileName, setCurrentFileName] = useState<string | null>(null);
	const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

	// Folder and file selection state
	const [files, setFiles] = useState<MarkdownFile[]>([]);
	const [selectedFile, setSelectedFile] = useState<string>('');
	const [isLoadingFiles, setIsLoadingFiles] = useState(false);
	const [isLoadingFile, setIsLoadingFile] = useState(false);

	// Store file contents in memory for client-side files
	const fileContentsRef = useRef<Map<string, string>>(new Map());
	// Store all files from folder (including images) for base64 conversion
	const allFilesRef = useRef<Map<string, File>>(new Map());

	// UI state
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);

	// Ref for folder picker input
	const folderInputRef = useRef<HTMLInputElement>(null);
	// Ref for single file picker input
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Ensure webkitdirectory attribute is set on the input element
	useEffect(() => {
		const input = folderInputRef.current;
		if (input) {
			input.setAttribute('webkitdirectory', '');
			input.setAttribute('directory', '');
		}
	}, []);

	const htmlContent = marked(markdown);

	// Convert an image file to base64 data URI
	const fileToBase64 = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target?.result as string);
			reader.onerror = () => reject(new Error('Failed to convert file'));
			reader.readAsDataURL(file);
		});
	};

	// Find and replace image references with base64 data URIs
	const convertImagesToBase64 = async (
		markdown: string,
		basePath: string
	): Promise<string> => {
		// Match markdown image syntax: ![alt](path)
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		const replacements: Array<{ original: string; replacement: string }> = [];

		let match;
		while ((match = imageRegex.exec(markdown)) !== null) {
			const [fullMatch, alt, imagePath] = match;

			// Skip if already a data URI or HTTP URL
			if (imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
				continue;
			}

			// Try multiple path resolutions
			const possiblePaths = [
				resolveImagePath(basePath, imagePath),           // Relative to markdown file
				imagePath.replace(/^\.?\//, ''),                  // Just filename (for same dir)
				resolveImagePath(basePath, './' + imagePath),     // With ./
			];

			// Find the image file in our stored files
			let imageFile: File | undefined;
			let foundPath: string | undefined;
			for (const path of possiblePaths) {
				imageFile = allFilesRef.current.get(path);
				if (imageFile) {
					foundPath = path;
					break;
				}
			}

			if (imageFile && imageFile.type.startsWith('image/')) {
				const base64 = await fileToBase64(imageFile);
				replacements.push({
					original: fullMatch,
					replacement: `![${alt}](${base64})`,
				});
			}
		}

		// Apply all replacements
		let result = markdown;
		for (const { original, replacement } of replacements) {
			result = result.replace(original, replacement);
		}

		return result;
	};

	// Resolve image path relative to markdown file path
	const resolveImagePath = (markdownPath: string, imagePath: string): string => {
		// Remove leading slash or ./ from image path
		const cleanImagePath = imagePath.replace(/^\.?\//, '');

		// Get directory of markdown file
		const lastSlashIndex = markdownPath.lastIndexOf('/');
		const baseDir =
			lastSlashIndex >= 0 ? markdownPath.substring(0, lastSlashIndex + 1) : '';

		return baseDir + cleanImagePath;
	};

	// Directories to ignore when scanning folders
	const IGNORED_DIRECTORIES = [
		'node_modules',
		'.git',
		'dist',
		'build',
		'.astro',
		'.next',
		'.nuxt',
		'coverage',
		'.vscode',
		'.idea',
		'.claude',
		'vendor',
		'bower_components',
	];

	// Check if a file path should be ignored
	const shouldIgnoreFile = (path: string): boolean => {
		const pathLower = path.toLowerCase();
		return IGNORED_DIRECTORIES.some(dir => {
			// Match both 'dir/' and '/dir/' in the path
			const pattern = new RegExp(`(^|/)${dir}(/|$)`, 'i');
			return pattern.test(pathLower);
		});
	};

	// Handle folder selection via native picker
	const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = e.target.files;
		if (!selectedFiles || selectedFiles.length === 0) return;

		setIsLoadingFiles(true);
		setError(null);
		fileContentsRef.current.clear();
		allFilesRef.current.clear();

		try {
			// Convert FileList to array
			const fileList = Array.from(selectedFiles);

			// Only process files at root level for markdown, and up to one subdirectory for images
			const filteredFiles = fileList.filter(file => {
				const path = (file as any).webkitRelativePath || file.name;
				const slashCount = (path.match(/\//g) || []).length;

				// Skip ignored directories
				if (shouldIgnoreFile(path)) return false;

				// Keep root-level files (1 slash) and images in immediate subdirectories (2 slashes)
				const isMarkdown = file.name.toLowerCase().match(/\.(md|markdown|mdx|mkd|mdown)$/);
				const isImage = file.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|svg)$/);

				if (isMarkdown) {
					// Only markdown files at root level
					return slashCount === 1;
				} else if (isImage) {
					// Images at root level or one subdirectory deep
					return slashCount <= 2;
				}
				return false;
			});

			// Store filtered files
			for (const file of filteredFiles) {
				const path = (file as any).webkitRelativePath || file.name;
				allFilesRef.current.set(path, file);
			}

			const markdownFiles = filteredFiles
				.filter((file) => {
					const lowerName = file.name.toLowerCase();
					return lowerName.endsWith('.md') ||
					       lowerName.endsWith('.markdown') ||
					       lowerName.endsWith('.mdx') ||
					       lowerName.endsWith('.mkd') ||
					       lowerName.endsWith('.mdown');
				})
				.map((file) => ({
					name: file.name,
					file: file,
					size: file.size,
					// Use webkitRelativePath as path for folder files
					path: (file as any).webkitRelativePath || file.name,
					modified: new Date(file.lastModified),
				}))
				.sort((a, b) => b.modified.getTime() - a.modified.getTime());

			setFiles(markdownFiles);

			if (markdownFiles.length === 0) {
				setError(`No markdown files found at root level. Try selecting a folder with markdown files directly.`);
			} else {
				// Auto-select first file
				setSelectedFile(markdownFiles[0].name);
				loadFileContent(markdownFiles[0]);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to read folder');
			setFiles([]);
		} finally {
			setIsLoadingFiles(false);
			// Reset input so same folder can be selected again
			if (folderInputRef.current) {
				folderInputRef.current.value = '';
			}
		}
	};

	// Read file content client-side
	const readFileContent = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target?.result as string);
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		});
	};

	// Load file content for client-side file
	const loadFileContent = async (file: MarkdownFile) => {
		if (!file.file) return;

		setIsLoadingFile(true);
		setError(null);

		try {
			let content = fileContentsRef.current.get(file.name);
			if (!content) {
				content = await readFileContent(file.file);
				// Convert images to base64 if we have the files available
				content = await convertImagesToBase64(content, file.path);
				fileContentsRef.current.set(file.name, content);
			}
			setMarkdown(content);
			setCurrentFileName(file.name);
			setCurrentFilePath(file.path);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to read file');
		} finally {
			setIsLoadingFile(false);
		}
	};

	// Handle file selection change
	const handleFileChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		setSelectedFile(value);

		if (!value) return;

		const file = files.find((f) => f.path === value);
		if (file) {
			await loadFileContent(file);
		}
	};

	const generatePDF = async () => {
		setIsGenerating(true);
		setError(null);

		try {
			// Do a final pass to convert any images to base64
			// This handles images added by editing the markdown
			const markdownWithImages = currentFilePath
				? await convertImagesToBase64(markdown, currentFilePath)
				: markdown;

			const response = await fetch('/api/generate-pdf', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markdown: markdownWithImages }),
			});

			if (!response.ok) {
				throw new Error('Failed to generate PDF');
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${currentFileName || 'document'}.pdf`.replace('.md.pdf', '.pdf');
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to generate PDF');
		} finally {
			setIsGenerating(false);
		}
	};

	const openFolderPicker = async () => {
		// Check if File System Access API is supported
		const supportsFSAccess = 'showDirectoryPicker' in window;

		if (!supportsFSAccess) {
			// Detect Brave specifically for a helpful message
			const isBrave = (navigator as any).brave && await (navigator as any).brave.isBrave();
			if (isBrave) {
				// Brave doesn't support File System Access API at all (disabled for privacy)
				// Only show this once
				const hasShownTip = localStorage.getItem('md2pdf-brave-tip-shown');
				if (!hasShownTip) {
					alert('Note: Brave doesn\'t support folder access without the file count warning. For a cleaner experience, try Chrome or Edge. (Your files are still filtered correctly!)');
					localStorage.setItem('md2pdf-brave-tip-shown', 'true');
				}
			}
		}

		if (supportsFSAccess) {
			try {
				// Use File System Access API (better UX, no scary file count)
				const dirHandle = await (window as any).showDirectoryPicker();

				setIsLoadingFiles(true);
				setError(null);
				fileContentsRef.current.clear();
				allFilesRef.current.clear();

				const markdownFiles: MarkdownFile[] = [];
				const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
				const markdownExtensions = ['.md', '.markdown', '.mdx', '.mkd', '.mdown'];

				// Only scan root level for markdown, root + one subdirectory for images
				for await (const entry of dirHandle.values()) {
					if (entry.kind === 'file') {
						const name = entry.name.toLowerCase();

						// Check for markdown files (root level only)
						if (markdownExtensions.some(ext => name.endsWith(ext))) {
							const file = await entry.getFile();
							markdownFiles.push({
								name: entry.name,
								file: file,
								size: file.size,
								path: entry.name,
								modified: new Date(file.lastModified),
							});
							allFilesRef.current.set(entry.name, file);
						}
						// Check for image files (root level)
						else if (imageExtensions.some(ext => name.endsWith(ext))) {
							const file = await entry.getFile();
							allFilesRef.current.set(entry.name, file);
						}
					} else if (entry.kind === 'directory') {
						// Skip ignored directories
						if (IGNORED_DIRECTORIES.includes(entry.name)) {
							continue;
						}
						// Scan one level of subdirectories for images only
						if (entry.name === 'public' || entry.name === 'assets' || entry.name === 'images' || entry.name === 'img') {
							for await (const subEntry of (entry as any).values()) {
								if (subEntry.kind === 'file') {
									const subName = subEntry.name.toLowerCase();
									if (imageExtensions.some(ext => subName.endsWith(ext))) {
										const file = await subEntry.getFile();
										const relativePath = `${entry.name}/${subEntry.name}`;
										allFilesRef.current.set(relativePath, file);
									}
								}
							}
						}
					}
				}

				markdownFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime());
				setFiles(markdownFiles);

				if (markdownFiles.length === 0) {
					setError(`No markdown files found at root level.`);
				} else {
					setSelectedFile(markdownFiles[0].name);
					loadFileContent(markdownFiles[0]);
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					setError(err.message || 'Failed to open folder');
				}
			} finally {
				setIsLoadingFiles(false);
			}
		} else {
			// Fallback to traditional input with webkitdirectory
			folderInputRef.current?.click();
		}
	};

	const openFilePicker = () => {
		fileInputRef.current?.click();
	};

	// Handle single file selection
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (!selectedFile) return;

		setIsLoadingFile(true);
		setError(null);

		try {
			const content = await readFileContent(selectedFile);
			setMarkdown(content);
			setCurrentFileName(selectedFile.name);
			setCurrentFilePath(null); // Single files don't have folder context for images
			// Clear the files list since we opened a single file
			setFiles([]);
			setSelectedFile('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to read file');
		} finally {
			setIsLoadingFile(false);
			// Reset input so same file can be selected again
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	return (
		<div className="container">
			<header className="header">
				<div className="logo">
					<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M4 6C4 4.89543 4.89543 4 6 4H26C27.1046 4 28 4.89543 28 6V26C28 27.1046 27.1046 28 26 28H6C4.89543 28 4 27.1046 4 26V6Z" stroke="currentColor" strokeWidth="2"/>
						<path d="M10 10H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
						<path d="M10 16H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
						<path d="M10 22H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
					</svg>
					<h1>MD2PDF</h1>
				</div>

				{/* File selector in header */}
				<div className="header-file-selector">
					<button
						className="folder-picker-header-btn"
						onClick={openFilePicker}
						disabled={isLoadingFile}
						type="button"
						title="Open a single markdown file"
					>
						<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M4 2C3.44772 2 3 2.44772 3 3V15C3 15.5523 3.44772 16 4 16H11V15H4V3H11V6H14V8H15V6L11 2H4Z" fill="currentColor"/>
							<path d="M12 9V14H15V9H12ZM11 8H16V15H11V8Z" fill="currentColor"/>
						</svg>
						<span>Open File</span>
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".md,.markdown,.mdx,.mkd,.mdown"
						className="hidden-folder-input"
						onChange={handleFileSelect}
					/>
					<button
						className="folder-picker-header-btn"
						onClick={openFolderPicker}
						disabled={isLoadingFiles}
						type="button"
						title="Select folder with markdown files"
					>
						<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4C2 2.89543 2.89543 2 4 2H7.5L9.5 4H14C15.1046 4 16 4.89543 16 6V14C16 15.1046 15.1046 16 14 16H4C2.89543 16 2 15.1046 2 14V4Z" stroke="currentColor" strokeWidth="1.5"/>
							<path d="M2 8H16" stroke="currentColor" strokeWidth="1.5"/>
						</svg>
						<span>Open Folder</span>
					</button>
					<input
						ref={folderInputRef}
						type="file"
						// @ts-ignore - webkitdirectory is non-standard but widely supported
						webkitdirectory=""
						directory=""
						className="hidden-folder-input"
						onChange={handleFolderSelect}
						multiple
						// Also try the data attribute approach as fallback
						data-directory="true"
					/>

					<div className="file-dropdown-wrapper">
						{files.length > 0 && (
							<>
								<select
									className="header-file-select"
									value={selectedFile}
									onChange={handleFileChange}
									disabled={isLoadingFile}
								>
									<option value="">Select a file...</option>
									{files.map((file) => (
										<option key={file.path} value={file.path}>
											{file.name}
										</option>
									))}
								</select>
								<span className="file-count-badge">{files.length}</span>
							</>
						)}
					</div>
				</div>

				<div className="header-actions">
					<button
						className="view-toggle"
						onClick={() => setShowPreview(!showPreview)}
						type="button"
					>
						{showPreview ? 'Editor Only' : 'Split View'}
					</button>
					<button
						className="generate-btn"
						onClick={generatePDF}
						disabled={isGenerating || !markdown}
						type="button"
					>
						{isGenerating ? (
							<>
								<span className="spinner" />
								Generating...
							</>
						) : (
							<>
								<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M4 6C4 4.89543 4.89543 4 6 4H14C15.1046 4 16 4.89543 16 6V14C16 15.1046 15.1046 16 14 16H6C4.89543 16 4 15.1046 4 14V6Z" stroke="currentColor" strokeWidth="1.5"/>
									<path d="M16 8H16.5C17.3284 8 18 8.67157 18 9.5V14.5C18 15.3284 17.3284 16 16.5 16H16" stroke="currentColor" strokeWidth="1.5"/>
									<path d="M7 10H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
									<path d="M7 13H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
								</svg>
								Download PDF
							</>
						)}
					</button>
				</div>
			</header>

			<main className={`editor-container ${showPreview ? 'split-view' : 'editor-only'}`}>
				<div className="editor-panel">
					<div className="editor-header">
						<span>{currentFileName || 'Untitled'}</span>
						<span className="char-count">{markdown.length} chars</span>
					</div>
					<textarea
						value={markdown}
						onChange={(e) => setMarkdown(e.target.value)}
						placeholder="Enter your Markdown here..."
						spellCheck={false}
					/>
				</div>

				{showPreview && (
					<div className="preview-panel">
						<div className="preview-header">Preview</div>
						<div
							className="preview-content"
							dangerouslySetInnerHTML={{ __html: htmlContent }}
						/>
					</div>
				)}
			</main>

			{isLoadingFile && (
				<div className="loading-toast">
					<span className="spinner" />
					Loading file...
				</div>
			)}

			{error && (
				<div className="error-toast">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
						<circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
						<path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
					</svg>
					{error}
					<button onClick={() => setError(null)} type="button">Dismiss</button>
				</div>
			)}
		</div>
	);
}
