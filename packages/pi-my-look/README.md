# pi-my-look

Version 0.1.12

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

## Features

- **Pulsating Status Dot:** Animated dot (○ ◔ ◐ ◕ ●) indicating tool execution state (yellow for in-progress, green for success, red for error).
- **Tool Icons:** Visual unicode symbols for each action (🔍 `Read`, 💾 `Write`, ✏️ `Edit`, ❯ `Bash`) for faster recognition.
- **Semantic Path Highlighting:** File paths are rendered with dimmed directories and accented filenames to reduce visual noise.
- **Smart Formatting:** Multi-line bash commands are automatically indented for readability.
- **Inline Diff Stats:** The `edit` tool displays addition/removal counts (e.g., `+5 / -2`) directly on the collapsed call line.
- **Collapsible Execution Results:** Output is hidden by default when collapsed, showing a keyboard hint to expand. When expanded, it previews content (e.g., file lines, bash output, or full colored diffs for edits).

## Changelog

- 0.1.12 (2026-06-14)
  - Add tool-specific unicode iconography (🔍, 💾, ✏️, ❯).
  - Implement semantic path highlighting (dimmed directories).

- 0.1.11 (2026-06-14)
  - Internal version bump.

- 0.1.10 (2026-06-14)
  - Add pulsating dot animation (○ ◔ ◐ ◕ ●) for in-progress tool calls.

- 0.1.9 (2026-06-14)
  - Remove startup splash and associated timers.
  - Simplify working indicator to pulsating dot on tool call lines.

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the tool rendering logic in `packages/pi-my-look/extensions/pi-my-look.ts` to change icons, colors, or formatting. For npm installs, you can override with a local copy or a fork.

## License

MIT
