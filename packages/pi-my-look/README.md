# pi-my-look

Version 0.2.0

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

![pi-my-look preview](pi-my-look-preview.png)

## Features

- **Pulsating Status Dot:** A single `●` that pulses through theme colors (muted → accent → warning → accent → muted → dim) to indicate tool execution state — cycling while in-progress, green on success, red on error.
- **Tool Icons:** Visual unicode symbols at a glance for all commonly used tools:

  | Icon | Tools | Notes |
  |------|-------|-------|
  | 🔍 | `read` | ★ |
  | 💾 | `write` | ★ |
  | ✏️ | `edit` | ★ |
  | 💻 | `bash` | ★ |
  | 🔎 | `grep`, `find` | ☆ generic |
  | 📂 | `ls` | ☆ generic |
  | 🌐 | `browser` | ⚡ easily add — see below |
  | 🔎 | `search` | ⚡ |
  | 💭 | `think` | ⚡ |
  | 🔔 | `notify` | ⚡ |
  | ❓ | `ask` | ⚡ |
  | 📋 | `context` | ⚡ |

  > **Legend:** ★ = custom renderer with path highlighting, diff stats, etc. \
  > ☆ = generic factory (dot + icon + argument display) \
  > ⚡ = icon mapped in `TOOL_ICONS`, ready to activate by registering in the generic loop

- **Generic Tool Rendering:** Tools beyond the special-cased four (read, write, edit, bash) get consistent dot + icon + argument display from a shared `createGenericToolRenderer()` factory. Currently active for `grep`, `find`, and `ls`. Any tool in the `TOOL_ICONS` map can be activated by adding a one-liner to the generic originals loop.
- **Semantic Path Highlighting:** File paths are rendered with dimmed directories and accented filenames to reduce visual noise.
- **Smart Formatting:** Multi-line bash commands are automatically indented (using dynamic indent width that adapts to the prefix) for readability.
- **Inline Diff Stats:** The `edit` tool displays addition/removal counts (e.g., `+5 / -2`) directly on the collapsed call line, computed once in `execute` to avoid render loops.
- **Collapsible Execution Results:** Output is hidden by default when collapsed, showing a keyboard hint to expand. When expanded, it previews content (e.g., file lines, bash output, or full colored diffs for edits).

## Prerequisites

- **pi** >= 0.79.0 — earlier versions may not export all types used by this extension (`ToolRenderContext`, tool details interfaces like `ReadToolDetails`, `BashToolDetails`, `EditToolDetails`).
- **@earendil-works/pi-tui** — required peer dependency. The extension uses `Text`, `keyHint`, and theme functions exported by pi-tui.
- **Modern terminal** with Unicode/emoji support — see [Compatibility](#compatibility) below.

## Compatibility

This extension uses emoji icons (🔍 💾 ✏️ 💻 🌐 🔎 💭 🔔 ❓ 📋 📂) and a single `●` dot for tool rendering. These characters require:

- A **modern terminal emulator** with good Unicode support (e.g., kitty, iTerm2, Windows Terminal, GNOME Terminal, Alacritty).
- An **emoji-aware font** or a **Nerd Font** that includes the required glyphs. If emoji appear as blank squares or boxes, try installing a Nerd Font ([nerdfonts.com](https://www.nerdfonts.com/)) and configuring your terminal to use it.

The extension degrades gracefully if the terminal lacks full Unicode support — tool names and file paths remain readable, but icons may not render as intended.

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the tool rendering logic in `packages/pi-my-look/extensions/pi-my-look.ts` to change icons, colors, or formatting. For npm installs, you can override with a local copy or a fork.

## Changelog

- 0.1.17 (2026-06-16)
  - Pulse dot cycles through theme colors (`muted`, `accent`, `warning`, `accent`, `muted`, `dim`) instead of swapping unicode glyphs. More consistent across terminals.

- 0.1.16 (2026-06-15)
  - Remove tool name text from render call lines — emoji icon alone identifies the tool (e.g., `●  🔍 (path)` instead of `●  🔍read (path)`).

- 0.1.15 (2026-06-15)
  - Add icon rendering for all built-in tools (grep, find, ls) via a generic factory. `TOOL_ICONS` map serves as single source of truth. Closes #6.

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
