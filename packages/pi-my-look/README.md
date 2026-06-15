# pi-my-look

Version 0.1.14

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

![pi-my-look preview](pi-my-look-preview.png)

## Features

- **Pulsating Status Dot:** Animated dot (○ ◔ ◐ ◕ ●) indicating tool execution state (yellow for in-progress, green for success, red for error).
- **Tool Icons:** Visual unicode symbols for each action (🔍 `Read`, 💾 `Write`, ✏️ `Edit`, ❯ `Bash`) for faster recognition.
- **Semantic Path Highlighting:** File paths are rendered with dimmed directories and accented filenames to reduce visual noise.
- **Smart Formatting:** Multi-line bash commands are automatically indented for readability.
- **Inline Diff Stats:** The `edit` tool displays addition/removal counts (e.g., `+5 / -2`) directly on the collapsed call line.
- **Collapsible Execution Results:** Output is hidden by default when collapsed, showing a keyboard hint to expand. When expanded, it previews content (e.g., file lines, bash output, or full colored diffs for edits).

## Prerequisites

- **pi** >= 0.79.0 — earlier versions may not export all types used by this extension (`ToolRenderContext`, tool details interfaces like `ReadToolDetails`, `BashToolDetails`, `EditToolDetails`).
- **@earendil-works/pi-tui** — required peer dependency. The extension uses `Text`, `keyHint`, and theme functions exported by pi-tui.
- **Modern terminal** with Unicode/emoji support — see [Compatibility](#compatibility) below.

## Compatibility

This extension uses Unicode circle characters (○ ◔ ◐ ◕ ●) and emoji icons (🔍 💾 ✏️ ❯) for tool rendering. These characters require:

- A **modern terminal emulator** with good Unicode support (e.g., kitty, iTerm2, Windows Terminal, GNOME Terminal, Alacritty).
- An **emoji-aware font** or a **Nerd Font** that includes the required glyphs. If emoji appear as blank squares or boxes, try installing a Nerd Font ([nerdfonts.com](https://www.nerdfonts.com/)) and configuring your terminal to use it.

The extension degrades gracefully if the terminal lacks full Unicode support — tool names and file paths remain readable, but icons and status dots may not render as intended.

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the tool rendering logic in `packages/pi-my-look/extensions/pi-my-look.ts` to change icons, colors, or formatting. For npm installs, you can override with a local copy or a fork.

## Changelog

- 0.1.14 (2026-06-15)
  - Compute edit diff stats in `execute` instead of `renderResult` to avoid render loops.
  - Replace hardcoded bash indent width with dynamic calculation.

- 0.1.13 (2026-06-14) — reverted
  - Powerline-style input frame with path and git status (reverted due to rendering issues).

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

## License

MIT
