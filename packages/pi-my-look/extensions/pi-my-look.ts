/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Tool rendering with inline icons and diff/result previews
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
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

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
      const title = theme.fg("toolTitle", theme.bold(capitalize("read")));
      const path = theme.fg("accent", args.path);

      // Append :offset-end range inline when the LLM has specified them
      let range = "";
      if (args.offset !== undefined || args.limit !== undefined) {
        const start = args.offset ?? 1;
        const end = args.limit !== undefined ? start + args.limit - 1 : undefined;
        range = theme.fg("muted", `:${start}${end !== undefined ? `-${end}` : ""}`);
      }

      let text = `${dot} ${title}(${path}${range})`;
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
      const title = theme.fg("toolTitle", theme.bold(capitalize("write")));
      const path = theme.fg("accent", args.path);
      let text = `${dot} ${title}(${path})`;
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
      const title = theme.fg("toolTitle", theme.bold(capitalize("edit")));
      const path = theme.fg("accent", args.path);
      let text = `${dot} ${title}(${path})`;

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
      const title = theme.fg("toolTitle", theme.bold(capitalize("bash")));
      const lines = args.command.split('\n').filter((l) => l.trim());

      let cmd: string;
      if (lines.length > 1) {
        const indent = " ".repeat(7); // "● Bash(" is 7 characters
        cmd = lines.map((line, i) => i === 0 ? line : indent + line).join('\n');
      } else {
        cmd = args.command;
      }

      const coloredCmd = theme.fg("accent", cmd);
      let text = `${dot} ${title}(${coloredCmd})`;
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

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    // no-op: nothing to tear down
  });
}
