import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PACKAGE_NAME = 'vscode-mdx-include';

/**
 * Interface for a parsed file reference
 */
interface FileReference {
    filePath: string;
    lineRanges?: number[][];  // Array of line ranges [[start1, end1], [start2, end2], ...]
    highlightRanges?: number[][];  // Array of highlight ranges
    range: vscode.Range;
}

/**
 * Activate function called when extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
    // Register the diagnostic collection for our linter
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('mkdocs-links');
    context.subscriptions.push(diagnosticCollection);

    // Create and register providers only once
    const documentLinkProvider = new MkDocsDocumentLinkProvider();
    const completionProvider = new MkDocsLinkCompletionProvider();

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider({ language: 'markdown' }, documentLinkProvider),
        vscode.languages.registerCompletionItemProvider(
            { language: 'markdown' },
            completionProvider,
            '/', // Trigger completion on slash for sub-directories
            '.' // Trigger completion on dot for file extensions
        )
    );

    // Use a debounced function for updating diagnostics
    const debouncedUpdateDiagnostics = debounce((document: vscode.TextDocument) => {
        if (document.languageId === 'markdown') {
            updateDiagnostics(document, diagnosticCollection);
        }
    }, 500);

    // Subscribe to document events for linting with debouncing
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(debouncedUpdateDiagnostics),
        vscode.workspace.onDidChangeTextDocument(event => debouncedUpdateDiagnostics(event.document)),
        vscode.workspace.onDidSaveTextDocument(debouncedUpdateDiagnostics)
    );

    // Lint all markdown documents that are already open
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'markdown') {
            debouncedUpdateDiagnostics(document);
        }
    });
}

/**
 * Debounce function to limit the frequency of function calls
 */
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function (...args: Parameters<T>): void {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            func(...args);
            timeout = null;
        }, wait);
    };
}

/**
 * Updates diagnostics for a document
 */
function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
    if (document.languageId !== 'markdown') {
        return;
    }

    const text = document.getText();
    // Use a more efficient regex with a single pass
    const fileRefRegex = /\{[*!][>+-]?\s+([\w\d\/\.\-_]+)(\s+(?:ln|hl)?\[[\w,:-]+\])*\s*[*!]\}/g;
    const diagnostics: vscode.Diagnostic[] = [];
    let fileRefMatch;

    // Cache the document directory and mkdocs root directory to avoid recalculating
    const documentDir = path.dirname(document.uri.fsPath);
    const mkdocsRootDir = findNearestMkDocsConfig(documentDir);
    const baseDir = mkdocsRootDir || documentDir;

    while ((fileRefMatch = fileRefRegex.exec(text)) !== null) {
        const [fullMatch, filePath] = fileRefMatch;
        const startPos = document.positionAt(fileRefMatch.index);
        const endPos = document.positionAt(fileRefMatch.index + fullMatch.length);
        const range = new vscode.Range(startPos, endPos);

        // Check if the referenced file exists
        const resolvedPath = path.resolve(baseDir, filePath);
        if (!fs.existsSync(resolvedPath)) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `The referenced file does not exist: ${filePath}`,
                vscode.DiagnosticSeverity.Error
            );

            diagnostic.source = PACKAGE_NAME;
            diagnostics.push(diagnostic);
        }
    }

    collection.set(document.uri, diagnostics);
}

/**
 * Find all file references in a document
 */
function findFileReferences(document: vscode.TextDocument): FileReference[] {
    const text = document.getText();
    const fileReferences: FileReference[] = [];

    // Find all file references with the format {* path/to/file.ext ln[x:y,z] hl[a:b,c] *}
    const fileRefRegex = /\{[*!][>+-]?\s+([\w\d\/\.\-_]+)(\s+(?:ln|hl)?\[[\w,:-]+\])*\s*[*!]\}/g;
    let fileRefMatch;

    while ((fileRefMatch = fileRefRegex.exec(text)) !== null) {
        const [fullMatch, filePath] = fileRefMatch;
        const startPos = document.positionAt(fileRefMatch.index);
        const endPos = document.positionAt(fileRefMatch.index + fullMatch.length);

        const fileRef: FileReference = {
            filePath,
            range: new vscode.Range(startPos, endPos)
        };

        // Extract all parameters (ln and hl) only if there are parameters
        if (fullMatch.includes(' ln[') || fullMatch.includes(' hl[')) {
            const paramRegex = /\s+(ln|hl)\[([\d,:]+)\]/g;
            let paramMatch;

            while ((paramMatch = paramRegex.exec(fullMatch)) !== null) {
                const [_, paramType, rangeStr] = paramMatch;
                const ranges = parseRanges(rangeStr);

                if (paramType === 'ln') {
                    fileRef.lineRanges = ranges;
                } else if (paramType === 'hl') {
                    fileRef.highlightRanges = ranges;
                }
            }
        }

        fileReferences.push(fileRef);
    }

    return fileReferences;
}

/**
 * Parse a range string into an array of number ranges
 * @param rangeStr A string like "3:6,8,10:11"
 * @returns Array of ranges as [start, end] pairs
 */
function parseRanges(rangeStr: string): number[][] {
    const ranges: number[][] = [];
    const parts = rangeStr.split(',');

    for (const part of parts) {
        if (part.includes(':')) {
            const [start, end] = part.split(':').map(num => parseInt(num, 10));
            ranges.push([start, end]);
        } else {
            const lineNum = parseInt(part, 10);
            ranges.push([lineNum, lineNum]); // Single line is represented as [n, n]
        }
    }

    return ranges;
}

/**
 * Document Link Provider for MkDocs file references
 */
class MkDocsDocumentLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        const fileReferences = findFileReferences(document);
        const links: vscode.DocumentLink[] = [];

        if (fileReferences.length === 0) {
            return links;
        }

        // Cache document directory and mkdocs root to avoid recalculating
        const documentDir = path.dirname(document.uri.fsPath);
        const mkdocsRootDir = findNearestMkDocsConfig(documentDir);
        const baseDir = mkdocsRootDir || documentDir;

        for (const fileRef of fileReferences) {
            const resolvedPath = path.resolve(baseDir, fileRef.filePath);
            if (fs.existsSync(resolvedPath)) {
                const documentLink = new vscode.DocumentLink(
                    fileRef.range,
                    vscode.Uri.file(resolvedPath)
                );

                // Add tooltip information
                documentLink.tooltip = `Open ${fileRef.filePath}${fileRef.lineRanges ? ` at lines ${fileRef.lineRanges.map(range => range.join(':')).join(', ')}` : ''}`;

                links.push(documentLink);
            }
        }

        return links;
    }
}

/**
 * Completion provider for file paths in MkDocs file references
 */
class MkDocsLinkCompletionProvider implements vscode.CompletionItemProvider {
    // Cache for directory contents to avoid multiple filesystem reads
    private dirCache = new Map<string, { name: string, isDirectory: boolean }[]>();

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[] | undefined> {
        // Get text up to the cursor
        const lineText = document.lineAt(position.line).text.substring(0, position.character);

        // Quick check first - if no '{*' or '{!' in the line, return early
        if (!lineText.includes('{*') && !lineText.includes('{!')) {
            return undefined;
        }

        // Look for '{* ' to determine if we're in a file reference
        const match = lineText.match(/\{[*!][>+-]?\s+(.*?)$/);
        if (!match) {
            return undefined;
        }

        // If we are inside a parameter section (ln[] or hl[]), don't provide completions
        if (lineText.match(/\{[*!][>+-]?\s+[\w\d\/\.\-_]+\s+(?:ln|hl)?\[/)) {
            return undefined;
        }

        // Extract the current path being typed
        const currentPath = match[1];

        try {
            // Get the directory of the markdown file
            const docDir = path.dirname(document.uri.fsPath);

            // Find the mkdocs root directory, matching the link provider's behavior
            const mkdocsRootDir = findNearestMkDocsConfig(docDir);
            const baseDir = mkdocsRootDir || docDir;

            // Determine the directory to search based on the current path
            let searchDir: string;
            let prefix: string;
            let partialFileName: string = '';

            if (currentPath.includes('/')) {
                // If the path includes slashes, get the directory part
                const lastSlashIndex = currentPath.lastIndexOf('/');
                prefix = currentPath.substring(0, lastSlashIndex + 1);
                partialFileName = currentPath.substring(lastSlashIndex + 1);
                searchDir = path.resolve(baseDir, prefix);
            } else {
                // Otherwise, search in the base directory (mkdocs root or document directory)
                searchDir = baseDir;
                prefix = '';
                partialFileName = currentPath;
            }

            // Get a list of files and directories in the search directory
            const files = await this.getFilesInDirectory(searchDir);

            // Filter files that match the partial filename if it exists
            const filteredFiles = partialFileName ?
                files.filter(file => file.name.toLowerCase().startsWith(partialFileName.toLowerCase())) :
                files;

            // Calculate the start position for replacement
            const startPos = new vscode.Position(
                position.line,
                lineText.length - partialFileName.length
            );
            const replaceRange = new vscode.Range(startPos, position);

            // Create completion items
            return filteredFiles.map(file => {
                const completionItem = new vscode.CompletionItem(
                    file.name,
                    file.isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
                );

                // Set the text to be inserted (just the filename, not the full path)
                completionItem.insertText = file.name;
                completionItem.range = replaceRange;

                // For directories, add a trailing slash
                if (file.isDirectory) {
                    completionItem.insertText = file.name + '/';
                    completionItem.command = {
                        command: 'editor.action.triggerSuggest',
                        title: 'Suggest'
                    };
                }

                completionItem.documentation = file.isDirectory ?
                    `Directory: ${prefix}${file.name}` :
                    `File: ${prefix}${file.name}`;

                return completionItem;
            });
        } catch (error) {
            console.error('Error providing completions:', error);
            return undefined;
        }
    }

    /**
     * Get a list of files and directories in the specified directory with caching
     */
    private async getFilesInDirectory(dirPath: string): Promise<{ name: string, isDirectory: boolean }[]> {
        // Check cache first
        if (this.dirCache.has(dirPath)) {
            return this.dirCache.get(dirPath)!;
        }

        try {
            const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const result = files.map(file => ({
                name: file.name,
                isDirectory: file.isDirectory()
            }));

            // Cache the result
            this.dirCache.set(dirPath, result);

            return result;
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
            return [];
        }
    }
}

/**
 * Find the nearest mkdocs.yml file by traversing up the directory tree
 * with a cache to avoid repeated filesystem access
 */
const mkdocsConfigCache = new Map<string, string | null>();

function findNearestMkDocsConfig(startDir: string): string | null {
    // Check cache first
    if (mkdocsConfigCache.has(startDir)) {
        return mkdocsConfigCache.get(startDir)!;
    }

    let currentDir = startDir;
    const checkedDirs = new Set<string>();

    // Traverse up until we hit the file system root
    while (!checkedDirs.has(currentDir)) {
        checkedDirs.add(currentDir);
        const mkdocsPath = path.join(currentDir, 'mkdocs.yml');

        if (fs.existsSync(mkdocsPath)) {
            // Cache result for all checked directories
            for (const dir of checkedDirs) {
                mkdocsConfigCache.set(dir, currentDir);
            }
            return currentDir;
        }

        // Get parent directory
        const parentDir = path.resolve(currentDir, '..');

        // If we've reached the filesystem root, stop searching
        if (parentDir === currentDir) {
            break;
        }

        // Move up one directory
        currentDir = parentDir;
    }

    // Cache negative result
    mkdocsConfigCache.set(startDir, null);
    return null;
}

// Deactivate function
export function deactivate() {
    // Clear caches
    mkdocsConfigCache.clear();
}