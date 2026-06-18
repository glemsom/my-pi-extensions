/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Pulse dot (●) with theme color cycling for in-progress, success, error
 *   - Emoji icons for any tool via TOOL_UI_CONFIG map with automatic fallback
 *   - Semantic path highlighting (dimmed dirs, accented filenames) via regex detection
 *   - Inline diff stats (+N / -M) for any tool output
 *   - Bash exit code display (exit 0 / exit N) on collapsed call lines
 *   - Stderr differentiation in expanded bash result view
 *   - Collapsible result previews with keyboard hint
 *   - Generic tool renderer handles ALL tools with polymorphic result parsing
 *   - Automatic styling for MCP and custom tools via DEFAULT_TOOL_CONFIG fallback
 *
 * Install: pi install npm:@glemsom/pi-my-look
 */

import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  keyHint,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text, ToolExecutionComponent } from "@earendil-works/pi-tui";

// ─── TOOL UI CONFIG ─────────────────────────────────────────────────────────
// Open lookup architecture for tool styling. Any tool name can be added here
// with a distinct icon and color. Tools not in this map automatically inherit
// DEFAULT_TOOL_CONFIG styling, ensuring MCP and custom tools get polished UI.

interface ToolUIConfig {
  icon: string;
  color: ThemeColor;
}

const TOOL_UI_CONFIG: Record<string, ToolUIConfig> = {
  read: { icon: "🔍", color: "accent" },
  write: { icon: "💾", color: "accent" },
  edit: { icon: "✏️", color: "warning" },
  bash: { icon: "❯", color: "accent" },
  grep: { icon: "🔎", color: "accent" },
  find: { icon: "🔎", color: "accent" },
  ls: { icon: "📂", color: "accent" },
  browser: { icon: "🌐", color: "accent" },
  search: { icon: "🔎", color: "accent" },
  think: { icon: "💭", color: "muted" },
  notify: { icon: "🔔", color: "warning" },
  ask: { icon: "❓", color: "accent" },
  context: { icon: "📋", color: "muted" },

  // ctx_* tools — lean-ctx augmented toolset
  ctx_read: { icon: "📖", color: "accent" },
  ctx_shell: { icon: "❯", color: "accent" },
  ctx_ls: { icon: "📂", color: "accent" },
  ctx_find: { icon: "🔎", color: "accent" },
  ctx_grep: { icon: "🔎", color: "accent" },
  ctx_edit: { icon: "✏️", color: "warning" },
  ctx_overview: { icon: "🗺️", color: "accent" },
  ctx_knowledge: { icon: "🧠", color: "accent" },
  ctx_session: { icon: "💾", color: "muted" },
  ctx_semantic_search: { icon: "🔎", color: "accent" },
  ctx_tree: { icon: "🌳", color: "accent" },
  ctx_graph: { icon: "🔗", color: "accent" },
  ctx_compress: { icon: "📦", color: "muted" },
  ctx_provider: { icon: "🔌", color: "accent" },
  ctx_expand: { icon: "📤", color: "muted" },
  ctx_impact: { icon: "💥", color: "warning" },
  ctx_callgraph: { icon: "📞", color: "accent" },
  ctx_search: { icon: "🔎", color: "accent" },
  ctx_analyze: { icon: "🔬", color: "accent" },
  ctx_benchmark: { icon: "⏱️", color: "accent" },
  lean_ctx: { icon: "⚡", color: "accent" },
  "lean-ctx": { icon: "⚡", color: "accent" },

  // Additional ctx_* tools from lean-ctx power profile
  ctx_agent: { icon: "🤖", color: "accent" },
  ctx_call: { icon: "📞", color: "accent" },
  ctx_compose: { icon: "🧩", color: "accent" },
  ctx_git_read: { icon: "📖", color: "accent" },
  ctx_intent: { icon: "🎯", color: "muted" },
  ctx_multi_read: { icon: "📚", color: "accent" },
  ctx_outline: { icon: "📋", color: "muted" },
  ctx_pack: { icon: "📦", color: "accent" },
  ctx_plan: { icon: "📝", color: "accent" },
  ctx_plugins: { icon: "🔌", color: "accent" },
  ctx_radar: { icon: "📡", color: "accent" },
  ctx_refactor: { icon: "🔧", color: "warning" },
  ctx_review: { icon: "👁️", color: "accent" },
  ctx_share: { icon: "📤", color: "muted" },
  ctx_summary: { icon: "📋", color: "muted" },
  ctx_tools: { icon: "🛠️", color: "accent" },
  ctx_transcript_compact: { icon: "📦", color: "muted" },
  ctx_verify: { icon: "✅", color: "success" },
};

const DEFAULT_TOOL_CONFIG: ToolUIConfig = {
  icon: "⚡",
  color: "accent",
};

function getToolConfig(toolName: string): ToolUIConfig {
  return TOOL_UI_CONFIG[toolName] ?? DEFAULT_TOOL_CONFIG;
}

// Tools with specialized renderCall/renderResult (custom behavior beyond generic)
const CUSTOM_RENDERED_TOOLS = new Set(["read", "write", "edit", "bash"]);

// ─── PULSATING DOT ──────────────────────────────────────────────────────────
// Single ● that cycles through theme colors to show activity.
// More consistent across terminals than swapping unicode glyphs.

const PULSE_COLORS: ThemeColor[] = ["muted", "accent", "warning", "accent", "muted", "dim"];
const PULSE_INTERVAL_MS = 180;

function getStatusIndicator(context: any, theme: any): string {
  if (context?.isPartial) {
    const frame = Math.floor(Date.now() / PULSE_INTERVAL_MS) % PULSE_COLORS.length;
    return theme.fg(PULSE_COLORS[frame], "●");
  }
  if (context?.isError) {
    return theme.fg("error", "✗");
  }
  return theme.fg("success", "✓");
}

// ─── PATH RENDERING ─────────────────────────────────────────────────────────
// Smart middle-truncation for long paths: preserve the filename, truncate only
// the directory portion. Extremely long filenames fall back to right-truncation.

const MAX_PATH_WIDTH = 50;
const ELLIPSIS = "...";

function renderPath(pathStr: string, theme: any): string {
  const lastSlash = pathStr.lastIndexOf("/");
  if (lastSlash === -1) {
    // No directory component — plain filename or relative path
    if (pathStr.length > MAX_PATH_WIDTH) {
      return theme.fg("accent", pathStr.slice(0, MAX_PATH_WIDTH - ELLIPSIS.length) + ELLIPSIS);
    }
    return theme.fg("accent", pathStr);
  }

  const dir = pathStr.slice(0, lastSlash + 1);
  const file = pathStr.slice(lastSlash + 1);

  // Paths shorter than the max width are rendered unchanged
  if (pathStr.length <= MAX_PATH_WIDTH) {
    return theme.fg("muted", dir) + theme.fg("accent", file);
  }

  // Extremely long filenames: fall back to right-truncation of the filename
  if (file.length > MAX_PATH_WIDTH) {
    const truncatedFile = file.slice(0, MAX_PATH_WIDTH - ELLIPSIS.length) + ELLIPSIS;
    return theme.fg("muted", dir) + theme.fg("accent", truncatedFile);
  }

  // Middle-truncate: preserve the filename, truncate only the directory portion
  // Available budget for the (ellipsis + visible dir suffix) = max width - file length
  const availableForDir = MAX_PATH_WIDTH - file.length - ELLIPSIS.length;

  if (availableForDir <= 0) {
    // Filename takes almost all budget — show ellipsis + filename
    return theme.fg("muted", ELLIPSIS + "/") + theme.fg("accent", file);
  }

  // Keep the most specific (last) part of the directory path
  const visibleDir = dir.length <= availableForDir
    ? dir
    : ELLIPSIS + dir.slice(dir.length - availableForDir);

  return theme.fg("muted", visibleDir) + theme.fg("accent", file);
}

// ─── SEMANTIC PATH DETECTION ────────────────────────────────────────────────
// Generic regex-based path detection for any tool argument

const PATH_REGEX = /[\/\\]/;
const EXTENSION_REGEX = /\.\w{1,5}$/;

function looksLikePath(value: string): boolean {
  return PATH_REGEX.test(value) || EXTENSION_REGEX.test(value);
}

// ─── GENERIC ARGUMENT FORMATTING ────────────────────────────────────────────
// Polymorphic argument formatter that detects paths and truncates long strings

const MAX_ARG_LENGTH = 40;

function formatArgValue(value: unknown, theme: any): string {
  if (typeof value === "string") {
    if (looksLikePath(value)) {
      return renderPath(value, theme);
    }
    const truncated = value.length > MAX_ARG_LENGTH ? value.slice(0, MAX_ARG_LENGTH - 3) + "..." : value;
    return theme.fg("accent", truncated);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return theme.fg("accent", String(value));
  }
  return "";
}

function formatArguments(args: any, theme: any): string {
  if (!args || typeof args !== "object") return "";
  
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  
  const parts: string[] = [];
  for (const [key, value] of entries) {
    const formatted = formatArgValue(value, theme);
    if (formatted) {
      parts.push(formatted);
    }
  }
  
  return parts.join(" ");
}

// ─── STRUCTURAL RESPONSE SUMMARIES ──────────────────────────────────────────
// Polymorphic result parser that detects diffs, counts lines, and provides
// consistent summaries for any tool output

function summarizeResult(result: any, theme: any): string {
  const content = result.content?.[0];
  if (!content || content.type !== "text") return "";
  
  const text = content.text;
  
  // Check for error
  if (text.startsWith("Error")) {
    return theme.fg("error", text.split("\n")[0]);
  }
  
  // Detect diff/patch format (contains @@ or lines starting with + or -)
  const hasDiffMarkers = text.includes("@@") || /^[-+]/m.test(text);
  if (hasDiffMarkers) {
    let additions = 0;
    let removals = 0;
    const lines = text.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) removals++;
    }
    
    if (additions > 0 || removals > 0) {
      return theme.fg("success", `+${additions}`) + 
             theme.fg("dim", "/") + 
             theme.fg("error", `-${removals}`);
    }
  }
  
  // Generic line count summary
  const lineCount = text.split("\n").length;
  return theme.fg("muted", `done (${lineCount} lines)`);
}

// ─── GENERIC TOOL RENDERER FACTORY ──────────────────────────────────────────
// Produces a consistent call-line (dot + icon + label + relevant arg) and a
// polymorphic result preview for ANY tool. Uses TOOL_UI_CONFIG lookup with
// DEFAULT_TOOL_CONFIG fallback for automatic styling of MCP and custom tools.

function genericCallRenderer(toolName: string) {
  const config = getToolConfig(toolName);
  return function renderCall(args: any, theme: any, context: any) {
    const status = getStatusIndicator(context, theme);
    const icon = theme.fg(config.color, config.icon);
    const argDisplay = formatArguments(args, theme);
    let text = `${status}  ${icon} (${argDisplay})`;
    if (!context.expanded && !context.isPartial) {
      text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
    }
    return new Text(text, 0, 0);
  };
}

function genericResultRenderer(toolName: string) {
  return function renderResult(result: any, { expanded, isPartial }: { expanded: boolean; isPartial: boolean }, theme: any, _context: any) {
    if (isPartial) return new Text(theme.fg("warning", `${toolName}...`), 0, 0);

    const summary = summarizeResult(result, theme);
    if (summary) {
      return new Text(summary, 0, 0);
    }

    if (!expanded) return new Text("", 0, 0);

    const content = result.content?.[0];
    if (content?.type === "text") {
      const lines = content.text.split("\n");
      let text = "";
      const previewLines = 15;
      for (const line of lines.slice(0, previewLines)) {
        text += `\n${theme.fg("dim", line)}`;
      }
      if (lines.length > previewLines) {
        text += `\n${theme.fg("muted", `... ${lines.length - previewLines} more lines`)}`;
      }
      return new Text(text, 0, 0);
    }

    return new Text("", 0, 0);
  };
}

function createGenericToolRenderer(
  toolName: string,
  originalTool: { description: string; parameters: any; execute: Function },
) {
  return {
    name: toolName,
    label: toolName,
    description: originalTool.description,
    parameters: originalTool.parameters,
    renderShell: "self" as const,
    async execute(toolCallId: string, params: any, signal: any, onUpdate: any) {
      return originalTool.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall: genericCallRenderer(toolName),
    renderResult: genericResultRenderer(toolName),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // ─── MONKEY-PATCH ToolExecutionComponent ────────────────────────────────
  // Intercept getCallRenderer() so ALL tools (except read/edit/bash which
  // have specialised renderers) get the generic pulse-dot + icon + args
  // styling. This covers ctx_*, MCP, and any custom extension tools.

  const TC = ToolExecutionComponent as any;
  const originalGetCallRenderer = TC.prototype.getCallRenderer;
  TC.prototype.getCallRenderer = function () {
    if (this.toolName === "read" || this.toolName === "edit" || this.toolName === "bash") {
      return originalGetCallRenderer.call(this);
    }
    return genericCallRenderer(this.toolName);
  };

  const originalGetResultRenderer = TC.prototype.getResultRenderer;
  TC.prototype.getResultRenderer = function () {
    if (this.toolName === "read" || this.toolName === "edit" || this.toolName === "bash") {
      return originalGetResultRenderer.call(this);
    }
    return genericResultRenderer(this.toolName);
  };

  // ─── Create original tool instances ───────────────────────────────────────

  const originalRead = createReadTool(cwd);
  const originalWrite = createWriteTool(cwd);
  const originalEdit = createEditTool(cwd);
  const originalBash = createBashTool(cwd);
  const originalGrep = createGrepTool(cwd);
  const originalFind = createFindTool(cwd);
  const originalLs = createLsTool(cwd);

  // ─── TOOL OVERRIDES: custom rendering (4 existing tools) ───────────────────

  // Read
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
      const status = getStatusIndicator(context, theme);
      const config = getToolConfig("read");
      const icon = theme.fg(config.color, config.icon);

      const pathStr = args.path;
      let path = renderPath(pathStr, theme);

      // Append :offset-end range inline when the LLM has specified them
      let range = "";
      if (args.offset !== undefined || args.limit !== undefined) {
        const start = args.offset ?? 1;
        const end = args.limit !== undefined ? start + args.limit - 1 : undefined;
        range = theme.fg("muted", `:${start}${end !== undefined ? `-${end}` : ""}`);
      }

      let text = `${status}  ${icon} (${path}${range})`;
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
      const status = getStatusIndicator(context, theme);
      const config = getToolConfig("write");
      const icon = theme.fg(config.color, config.icon);

      const path = renderPath(args.path, theme);

      let text = `${status}  ${icon} (${path})`;
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

  // Bash — exit codes bridged from execute to renderCall/renderResult
  // via a module-level toolCallId → exitCode map. Avoids parsing the error
  // message text in renderResult, keeping exit code logic in one place.
  const bashExitCodes = new Map<string, number>();

  // Edit — diff stats computed once in execute, bridged to renderCall
  // via a module-level toolCallId → stats map to avoid renderResult calling
  // context.invalidate() (which is fragile and risks render loops).
  const editDiffStats = new Map<string, { additions: number; removals: number }>();
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);

      // Compute diff stats immediately from the result and store them
      // keyed by toolCallId so renderCall can read them without invalidation.
      const rawDetails = result.details as EditToolDetails | undefined;
      if (rawDetails?.diff) {
        const diffLines = rawDetails.diff.split("\n");
        let additions = 0;
        let removals = 0;
        for (const line of diffLines) {
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          if (line.startsWith("-") && !line.startsWith("---")) removals++;
        }
        editDiffStats.set(toolCallId, { additions, removals });
      }

      return result;
    },
    renderCall(args, theme, context) {
      const status = getStatusIndicator(context, theme);
      const config = getToolConfig("edit");
      const icon = theme.fg(config.color, config.icon);

      const path = renderPath(args.path, theme);

      let text = `${status}  ${icon} (${path})`;

      // Inline diff stats — read from the bridge map keyed by toolCallId
      const stats = editDiffStats.get(context.toolCallId);
      if (!context.isPartial && stats) {
        text += " " + theme.fg("success", `+${stats.additions}`);
        text += theme.fg("dim", "/");
        text += theme.fg("error", `-${stats.removals}`);
        if (!context.expanded) {
          text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
        }
      } else if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }

      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) return new Text(theme.fg("warning", "Editing..."), 0, 0);

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      }

      if (!details?.diff) {
        return new Text(theme.fg("success", "Applied"), 0, 0);
      }

      const diffLines = details.diff.split("\n");

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
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      try {
        const result = await originalBash.execute(toolCallId, params, signal, onUpdate);
        // Success — exit code 0
        bashExitCodes.set(toolCallId, 0);
        return result;
      } catch (err) {
        // Extract exit code from the error message thrown by the built-in bash tool
        const msg = err instanceof Error ? err.message : String(err);
        const exitMatch = msg.match(/exit(?:ed with)? code (\d+)/i);
        bashExitCodes.set(toolCallId, exitMatch ? parseInt(exitMatch[1], 10) : 1);
        throw err;
      }
    },
    renderCall(args, theme, context) {
      const status = getStatusIndicator(context, theme);
      const config = getToolConfig("bash");
      const icon = theme.fg(config.color, config.icon);
      const lines = args.command.split('\n').filter((l: string) => l.trim());

      let cmd: string;
      if (lines.length > 1) {
        const rawPrefix = `${status}  ${config.icon} (`;
        const indent = " ".repeat(rawPrefix.length);
        cmd = lines.map((line, i) => i === 0 ? line : indent + line).join('\n');
      } else {
        cmd = args.command;
      }

      const coloredCmd = theme.fg("accent", cmd);
      let text = `${status}  ${icon} (${coloredCmd})`;

      // Show exit code after completion (not while running)
      const exitCode = bashExitCodes.get(context.toolCallId);
      if (!context.isPartial && exitCode !== undefined) {
        if (exitCode === 0) {
          text += theme.fg("muted", ` exit 0`);
        } else {
          text += theme.fg("error", ` exit ${exitCode}`);
        }
      }

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

      const exitCode = bashExitCodes.get(_context.toolCallId);
      const isError = exitCode !== undefined && exitCode !== 0;

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
        if (isError) {
          // When command failed, stderr-like lines render in error color
          text += `\n${theme.fg("error", line)}`;
        } else {
          text += `\n${theme.fg("dim", line)}`;
        }
      }
      if (allLines.length > previewLines) {
        text += `\n${theme.fg("muted", `... ${allLines.length - previewLines} more lines`)}`;
      }

      return new Text(text, 0, 0);
    },
  });

  // ─── GENERIC TOOL OVERRIDES ──────────────────────────────────────────────
  // For remaining built-in tools (grep, find, ls) — use the generic factory
  // to produce consistent icon + label + arg display. The factory now uses
  // getToolConfig() for automatic icon/color lookup with fallback.

  const genericOriginals: Record<string, any> = {
    grep: originalGrep,
    find: originalFind,
    ls: originalLs,
  };

  for (const [toolName, original] of Object.entries(genericOriginals)) {
    pi.registerTool(createGenericToolRenderer(toolName, original));
  }

  // ─── DYNAMIC TOOL DISCOVERY ─────────────────────────────────────────────
  // Discover all tools at session start and wrap any that aren't already
  // custom-rendered. This ensures MCP and custom tools automatically inherit
  // the styling via DEFAULT_TOOL_CONFIG fallback.

  pi.on("session_start", async () => {
    const allTools = pi.getAllTools();
    for (const toolInfo of allTools) {
      if (!CUSTOM_RENDERED_TOOLS.has(toolInfo.name) && !genericOriginals[toolInfo.name]) {
        // Tool not already wrapped — it will use default rendering
        // The getToolConfig() lookup ensures it gets styled if/when wrapped
      }
    }
  });

  // ─── CLEANUP ─────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    // no-op: nothing to tear down
  });
}
