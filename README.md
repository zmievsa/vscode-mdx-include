# VSCode Mdx Include

A VS Code extension that lints and provides navigation for mdx file references in markdown

## Features

This extension helps you work with mdx file references in markdown files by:

1. **Linting references**: Shows errors when referenced files don't exist
2. **Navigation**: Allows you to Ctrl+click on file references to navigate to the referenced file
3. **File Path Autocomplete**: Provides intelligent file path suggestions when editing file references

## Supported Syntax

The extension recognizes file references in markdown with the following syntax:

{* ../../path/to/file.py hl[2] *}

{* ../../path/to/file.py hl[5:9] *}

{* ../../path/to/file.py ln[3:6,8,10:11] hl[3,5:6,10] *}

Where:

- The path is relative to the current markdown file
- `hl[n]` specifies a highlighted line number (optional)
- `hl[n:m]` specifies a range of highlighted lines (optional)
- `ln[n:m,p,q:r]` specifies which lines to include in the snippet (optional)
  - Can contain single line numbers (`8`)
  - Can contain line ranges (`3:6`)
  - Can contain multiple ranges and single lines separated by commas (`3:6,8,10:11`)
- Both `ln` and `hl` parameters can be used together

## Usage

1. Open a markdown file with MkDocs-style file references
2. The extension will automatically lint references, showing errors for non-existent files in the Problems panel
3. Hover over a file reference to see a tooltip, or Ctrl+click (or Cmd+click on macOS) on a file reference to navigate to the referenced file
   - The entire file reference is clickable, including the surrounding `{* ... *}` pattern
4. When editing a file reference between `{* ... *}`, you'll get automatic path suggestions:
   - Type `/` to navigate into directories
   - Type `.` to get file extension suggestions
   - Folders will have a trailing slash and will trigger new suggestions when selected

## Extension Settings

- `mdxIncludeFile.rootDirectory`: The root directory from which all file paths will be resolved. If empty, paths are resolved relative to the markdown file. Can be absolute or relative to the workspace folder.
