# Installation

There are two ways to install this VS Code extension:

## Method 1: From the VSIX file

1. Open Visual Studio Code
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS)
3. Type "Extensions: Install from VSIX" and press Enter
4. Navigate to the location of the `vscode-mdx-include-X.X.X.vsix` file and select it
5. VS Code will install the extension and prompt you to reload

## Method 2: Building and installing from source

If you want to build the extension yourself:

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile the TypeScript code
4. Run `npm run package` to create the VSIX file
5. Follow the steps in Method 1 to install the VSIX file

## Usage

1. Open a markdown file that contains mdx file include links in code blocks
2. The extension will automatically lint references, showing errors for non-existent files in the Problems panel
3. Hover over a file reference to see a tooltip with information about the file
4. Ctrl+click (or Cmd+click on macOS) on a file reference to navigate to the referenced file
   - The entire file reference pattern `{* ... *}` is clickable
5. When editing file references, you'll get intelligent file path suggestions:
   - Start typing a path after `{*`
   - Use `/` to navigate into directories
   - Use `.` to trigger file extension suggestions
   - Folders will have a trailing slash and automatically trigger new suggestions

## Example

Create a markdown file with contents like this:

```markdown
# Test document

This is a code block with a file reference:

```python
{* ./src/extension.ts hl[5] *}
```

The extension will:

1. Show errors in the Problems panel if the file doesn't exist
2. Provide intelligent path completion when editing the path
3. Make the entire file reference clickable with Ctrl/Cmd
4. Allow you to navigate to line 5 of the extension.ts file when clicked
