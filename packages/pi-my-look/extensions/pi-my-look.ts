/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Tool rendering with inline icons and diff/result previews
 *   - Powerline input frame with path, git status, and rounded borders
 *
 * Install: pi install npm:@glemsom/pi-my-look
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  keyHint,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
  CustomEditor,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component, TUI, EditorTheme } from "@earendil-works/pi-tui";
import type { KeybindingsManager, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── PULSATING DOT ──────────────────────────────────────────────────────────
// Unicode circles ordered from emptiest → fullest → emptiest to simulate
// a breathing/pulsating indicator while a tool-call is in progress.

const PULSE_FRAMES = ["○", "◔", "◐", "◕", "●", "◕", "◐", "◔"];
const PULSE_INTERVAL_MS = 140;

function getDot(context: any, theme: any): string {
  if (context?.isPartial) {
    const frame = Math.floor(Date.now() / PULSE_INTERVAL_MS) % PULSE_FRAMES.length;
    return theme.fg("warning", PULSE_FRAMES[frame]);
  }
  if (context?.isError) {
    return theme.fg("error", "●");
  }
  return theme.fg("success", "●");
}

// ─── POWERLINE FRAME ────────────────────────────────────────────────────────
//
// Custom footer with rounded top border showing path + git branch,
// and a custom editor with rounded bottom border (╰─ ... ─╯).
// Together they form a powerline-style input frame.

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

/**
 * Fit left and right content into a border line of given width.
 * Shrinks left/right content when terminal is narrow.
 */
function fitBorder(
  left: string,
  right: string,
  width: number,
  border: (text: string) => string,
  fill: (text: string) => string = border,
): string {
  if (width <= 0) return "";
  if (width === 1) return border("─");

  let leftText = left;
  let rightText = right;
  const fixedWidth = 2;
  const minimumGap = 3;

  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(rightText) > 0
  ) {
    rightText = truncateToWidth(rightText, Math.max(0, visibleWidth(rightText) - 1), "");
  }
  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(leftText) > 0
  ) {
    leftText = truncateToWidth(leftText, Math.max(0, visibleWidth(leftText) - 1), "");
  }

  const gapWidth = Math.max(0, width - fixedWidth - visibleWidth(leftText) - visibleWidth(rightText));
  return `${border("─")}${leftText}${fill("─".repeat(gapWidth))}${rightText}${border("─")}`;
}

/** Footer component: renders ╭─ ~/path (branch) ─╮ */
class PowerlineFooter implements Component {
  private tui: TUI;
  private theme: Theme;
  private footerData: ReadonlyFooterDataProvider;
  private cwd: string;
  private disposeBranchWatch: (() => void) | null = null;

  constructor(
    tui: TUI,
    theme: Theme,
    footerData: ReadonlyFooterDataProvider,
    cwd: string,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.footerData = footerData;
    this.cwd = cwd;

    // Re-render when git branch changes
    this.disposeBranchWatch = footerData.onBranchChange(() => {
      this.tui.requestRender();
    });
  }

  render(width: number): string[] {
    const muted = (s: string) => this.theme.fg("muted", s);
    const accent = (s: string) => this.theme.fg("accent", s);
    const warning = (s: string) => this.theme.fg("warning", s);

    const path = accent(formatCwd(this.cwd));
    const branch = this.footerData.getGitBranch();
    const branchStr = branch
      ? muted("(") + warning(branch) + muted(")")
      : "";

    const leftLabel = path;
    const rightLabel = branchStr;

    const border = (s: string) => muted(s);
    const result = fitBorder(leftLabel, rightLabel, width, border, border);
    // Replace the leading ─ with ╭─ and trailing ─ with ─╮
    // fitBorder returns ─<left><gap><right>─, so swap the outer ─ for ╭ and ╮
    const line = `╭${result.slice(1, -1)}╮`;
    return [line];
  }

  invalidate(): void {
    // no cached state
  }

  dispose(): void {
    this.disposeBranchWatch?.();
  }
}

/** Custom editor: skips the top border, uses rounded bottom border ╰─ ... ─╯ */
class RoundedEditor extends CustomEditor {
  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme, keybindings);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 2) return lines;

    // Remove the top border line — the footer provides it
    lines.shift();

    // Transform the bottom border to rounded corners
    const lastIdx = lines.length - 1;
    const last = lines[lastIdx];

    // The last line is either a pure ─ border or a scroll indicator
    // Check if it's a scroll indicator (contains ↓)
    if (last.includes("↓")) {
      // Keep scroll indicator for content below, but make rounded
      // Scroll indicator looks like: ─── ↓ N more ────
      // Replace outer ─ chars with ╰/╯
      const firstNonBorder = last.search(/[^─]/);
      const lastNonBorder = last.length - 1 - last.split("").reverse().join("").search(/[^─]/);
      if (firstNonBorder >= 1 && lastNonBorder < last.length - 1) {
        lines[lastIdx] =
          this.borderColor("╰") +
          last.slice(1, last.length - 1) +
          this.borderColor("╯");
      }
      // If can't parse cleanly, leave as-is
    } else {
      // Pure bottom border: replace with rounded corners
      lines[lastIdx] = this.borderColor("╰") + this.borderColor("─".repeat(width - 2)) + this.borderColor("╯");
    }

    return lines;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // ─── TOOL ICONS: override 4 built-ins ─────────────────────────────────────

  // Read
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalRead.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const icon = theme.fg("muted", "🔍");
      const title = theme.fg("toolTitle", theme.bold(capitalize("read")));
      
      const pathStr = args.path;
      const lastSlash = pathStr.lastIndexOf("/");
      let path;
      if (lastSlash !== -1) {
        const dir = pathStr.slice(0, lastSlash + 1);
        const file = pathStr.slice(lastSlash + 1);
        path = theme.fg("muted", dir) + theme.fg("accent", file);
      } else {
        path = theme.fg("accent", pathStr);
      }

      // Append :offset-end range inline when the LLM has specified them
      let range = "";
      if (args.offset !== undefined || args.limit !== undefined) {
        const start = args.offset ?? 1;
        const end = args.limit !== undefined ? start + args.limit - 1 : undefined;
        range = theme.fg("muted", `:${start}${end !== undefined ? `-${end}` : ""}`);
      }

      let text = `${dot} ${icon} ${title}(${path}${range})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) {
        const content = result.content[0];
        if (content?.type === "image") {
          return new Text(theme.fg("success", "Image loaded"), 0, 0);
        }
        if (content?.type !== "text") {
          return new Text(theme.fg("error", "No content"), 0, 0);
        }
        const details = result.details as ReadToolDetails | undefined;
        if (details?.truncation?.truncated) {
          return new Text(theme.fg("warning", `truncated from ${details.truncation.totalLines} lines`), 0, 0);
        }
        return new Text("", 0, 0);
      }

      const details = result.details as ReadToolDetails | undefined;
      const content = result.content[0];

      if (content?.type === "image") {
        return new Text(theme.fg("success", "Image loaded"), 0, 0);
      }

      if (content?.type !== "text") {
        return new Text(theme.fg("error", "No content"), 0, 0);
      }

      const allLines = content.text.split("\n");
      const lineCount = allLines.length;
      let text = theme.fg("success", `${lineCount} lines`);
      if (details?.truncation?.truncated) {
        text += theme.fg("warning", ` (truncated from ${details.truncation.totalLines})`);
      }

      const previewLines = 15;
      const lines = allLines.slice(0, previewLines);
      for (const line of lines) {
        text += `\n${theme.fg("dim", line)}`;
      }
      if (lineCount > previewLines) {
        text += `\n${theme.fg("muted", `... ${lineCount - previewLines} more lines`)}`;
      }

      return new Text(text, 0, 0);
    },
  });

  // Write
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalWrite.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const icon = theme.fg("muted", "💾");
      const title = theme.fg("toolTitle", theme.bold(capitalize("write")));
      
      const pathStr = args.path;
      const lastSlash = pathStr.lastIndexOf("/");
      let path;
      if (lastSlash !== -1) {
        const dir = pathStr.slice(0, lastSlash + 1);
        const file = pathStr.slice(lastSlash + 1);
        path = theme.fg("muted", dir) + theme.fg("accent", file);
      } else {
        path = theme.fg("accent", pathStr);
      }

      let text = `${dot} ${icon} ${title}(${path})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme, _context) {
      if (isPartial) return new Text(theme.fg("warning", "Writing..."), 0, 0);

      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      }

      return new Text("", 0, 0);
    },
  });

  // Edit — diff stats are stored in shared context.state so renderCall can
  // display them inline on the same line, without a separate result row.
  type EditState = { additions?: number; removals?: number };
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalEdit.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const icon = theme.fg("muted", "✏️");
      const title = theme.fg("toolTitle", theme.bold(capitalize("edit")));
      
      const pathStr = args.path;
      const lastSlash = pathStr.lastIndexOf("/");
      let path;
      if (lastSlash !== -1) {
        const dir = pathStr.slice(0, lastSlash + 1);
        const file = pathStr.slice(lastSlash + 1);
        path = theme.fg("muted", dir) + theme.fg("accent", file);
      } else {
        path = theme.fg("accent", pathStr);
      }

      let text = `${dot} ${icon} ${title}(${path})`;

      // Inline diff stats once the result is available via shared state
      const state = context.state as EditState;
      if (!context.isPartial && state.additions !== undefined && state.removals !== undefined) {
        text += " " + theme.fg("success", `+${state.additions}`);
        text += theme.fg("dim", "/");
        text += theme.fg("error", `-${state.removals}`);
        if (!context.expanded) {
          text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
        }
      } else if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }

      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return new Text(theme.fg("warning", "Editing..."), 0, 0);

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      }

      if (!details?.diff) {
        return new Text(theme.fg("success", "Applied"), 0, 0);
      }

      // Count additions and removals from the diff
      const diffLines = details.diff.split("\n");
      let additions = 0;
      let removals = 0;
      for (const line of diffLines) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) removals++;
      }

      // Store stats in shared state and re-render the call line to show them inline
      const state = context.state as EditState;
      if (state.additions !== additions || state.removals !== removals) {
        state.additions = additions;
        state.removals = removals;
        context.invalidate();
      }

      // Collapsed: stats are shown inline on the call line — nothing needed here
      if (!expanded) return new Text("", 0, 0);

      // Expanded: show the full coloured diff
      let text = "";
      for (const line of diffLines.slice(0, 30)) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          text += `${text ? "\n" : ""}${theme.fg("success", line)}`;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          text += `${text ? "\n" : ""}${theme.fg("error", line)}`;
        } else {
          text += `${text ? "\n" : ""}${theme.fg("dim", line)}`;
        }
      }
      if (diffLines.length > 30) {
        text += `\n${theme.fg("muted", `... ${diffLines.length - 30} more diff lines`)}`;
      }

      return new Text(text, 0, 0);
    },
  });

  // Bash
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalBash.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const icon = theme.fg("muted", "❯");
      const title = theme.fg("toolTitle", theme.bold(capitalize("bash")));
      const lines = args.command.split('\n').filter((l) => l.trim());

      let cmd: string;
      if (lines.length > 1) {
        const indent = " ".repeat(9); // "● ❯ Bash(" is 9 characters
        cmd = lines.map((line, i) => i === 0 ? line : indent + line).join('\n');
      } else {
        cmd = args.command;
      }

      const coloredCmd = theme.fg("accent", cmd);
      let text = `${dot} ${icon} ${title}(${coloredCmd})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) return new Text(theme.fg("warning", "Running..."), 0, 0);

      const details = result.details as BashToolDetails | undefined;
      const content = result.content[0];
      const output = content?.type === "text" ? content.text : "";

      if (details?.truncation?.truncated) {
        return new Text(theme.fg("warning", "[truncated]"), 0, 0);
      }

      if (!expanded) {
        return new Text("", 0, 0);
      }

      const allLines = output.split("\n");
      let text = "";
      const previewLines = 20;
      for (const line of allLines.slice(0, previewLines)) {
        text += `\n${theme.fg("dim", line)}`;
      }
      if (allLines.length > previewLines) {
        text += `\n${theme.fg("muted", `... ${allLines.length - previewLines} more lines`)}`;
      }

      return new Text(text, 0, 0);
    },
  });

  // ─── POWERLINE FRAME: footer + editor ────────────────────────────────────

  let editorSet = false;

  pi.on("session_start", (_event, ctx) => {
    // Set the powerline footer with path and git branch
    ctx.ui.setFooter((tui, theme, footerData) => {
      return new PowerlineFooter(tui, theme, footerData, ctx.cwd);
    });

    // Set the custom editor with rounded bottom border (only once)
    if (!editorSet) {
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        return new RoundedEditor(tui, theme, keybindings);
      });
      editorSet = true;
    }
  });

  pi.on("session_shutdown", async () => {
    // no-op
  });
}
