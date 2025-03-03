# Test

This file demonstrates how the Mdx Include File extension works.

## Valid Reference

{* ./src/extension.ts hl[5] *}

## Invalid Reference

{* ./nonexistent-file.ts hl[10:15] *}

The reference above should show a linting error because the file doesn't exist.

## Line and Highlight Format Test

The line and highlight format with both ln and hl parameters:

{* ./src/extension.ts ln[3:6,8,10:11] hl[3,5:6,10] *}

## Navigation Test

Try Ctrl+clicking (or Cmd+clicking on macOS) on the file reference below to navigate to the file:

{* ./README.md hl[1] *}

## Autocomplete Test

To test the file path autocomplete feature:

1. Edit the code block below
2. Position the cursor right after `{*`
3. Start typing a path and notice the suggestions that appear
4. Use `/` to navigate into directories
5. Use `.` to get file extension suggestions

{* ./src/extension.ts *}
