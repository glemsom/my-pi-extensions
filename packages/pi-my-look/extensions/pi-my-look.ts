/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Branded splash on session start (ephemeral widget + welcome notify)
 *   - Persistent compact brand widget above editor
 *   - Tool icons (🔍 read · 📝 write · ✏️ edit · ⚡ bash) inline in chat
 *   - Generic 🔧 catch-all icon for custom tools via status bar
 *   - Live status pulse: ⚡ thinking… · ✓ done · ✗ error
 *   - Custom working indicator (dot pulse)
 *
 * Install: pi install npm:@glemsom/pi-my-look
 *
 * Customize: edit ICONS, TAGLINE, SPLASH_COLORS, BOX_WIDTH below.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — tweak these to taste
// ─────────────────────────────────────────────────────────────────────────────

const ICONS = {
  read: "🔍",
  write: "📝",
  edit: "✏️",
  bash: "⚡",
} as const;

const ICON_DEFAULT = "🔧";
const TAGLINE = "modern ui";

// Splash ANSI gradient color stops (top → bottom).
// DimLevel shrinks each channel for fade-out transitions.
const SPLASH_COLORS: readonly number[][] = [
  [255, 120, 200],
  [220, 140, 240],
  [180, 160, 255],
  [140, 200, 255],
  [100, 220, 220],
  [120, 255, 180],
  [200, 255, 120],
];

const BOX_WIDTH = 44; // inner content width between borders

/** Build the 7-line splash widget dynamically.
 *  tagline  — partial or full tag (empty = not yet revealed)
 *  dimLevel — 1.0 = full brightness, 0.0 = gone (fade steps)
 *  cursor   — show blinking block-cursor after tagline */
function buildSplashLines(tagline: string, dimLevel: number, cursor: boolean): string[] {
  const d = (i: number): string => {
    const [r, g, b] = SPLASH_COLORS[i]!;
    return `\x1b[38;2;${Math.round(r * dimLevel)};${Math.round(g * dimLevel)};${Math.round(b * dimLevel)}m`;
  };

  const tag = tagline || " ";
  const cur = cursor ? d(4) + "\x1b[5m▊\x1b[25m" : "";
  const pad = BOX_WIDTH - 9 - tag.length - 2 - (cursor ? 1 : 0);

  return [
    d(0) + "  ╭" + "─".repeat(BOX_WIDTH) + "╮\x1b[0m",
    d(1) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(2) + "  │    \x1b[1mπ  AGENT\x1b[0m" + d(2) + " ".repeat(BOX_WIDTH - 12) + "│\x1b[0m",
    d(3) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(4) + "  │       \x1b[3m· \x1b[1m" + tag + "\x1b[0m" + d(4) + "\x1b[3m ·\x1b[0m" + cur + d(4) + " ".repeat(Math.max(0, pad)) + "│\x1b[0m",
    d(5) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(6) + "  ╰" + "─".repeat(BOX_WIDTH) + "╯\x1b[0m",
  ];
}

// Persistent brand widget above editor (empty = no static text).
const BRAND_WIDGET: string[] = [];

const WIDGET_KEY = "pi-modern-brand";
const STATUS_KEY = "pi-modern-tools";
const SPLASH_DURATION_MS = 2500;

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // State
  let currentTool: { name: string; icon: string } | null = null;
  let splashTimer: ReturnType<typeof setTimeout> | null = null;
  let splashActive = false;

  // ─── SPLASH: typewriter reveal + fade-out exit ──────────────────────────

  let typewriterTimer: ReturnType<typeof setInterval> | null = null;
  let cursorTimer: ReturnType<typeof setInterval> | null = null;
  let fadeTimer: ReturnType<typeof setInterval> | null = null;
  let typewriterPos = 0;
  let cursorVisible = true;
  let typewriterDone = false;
  let fadingOut = false;

  function dismissSplash(ctx: ExtensionContext) {
    if (!splashActive || fadingOut) return;
    fadingOut = true;

    // Kill all running animations
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
    if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }

    // Fade out: 5 steps over ~300 ms
    const fadeSteps = [1.0, 0.7, 0.45, 0.2, 0.0];
    let step = 0;
    const displayTag = typewriterDone ? TAGLINE : TAGLINE.slice(0, typewriterPos) || TAGLINE;

    fadeTimer = setInterval(() => {
      step++;
      if (step >= fadeSteps.length) {
        // Fully gone — tear down splash
        if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
        splashActive = false;
        fadingOut = false;
        ctx.ui.setWidget(WIDGET_KEY, BRAND_WIDGET);
        return;
      }
      ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(displayTag, fadeSteps[step]!, false));
    }, 75);
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "new") {
      splashActive = true;
      typewriterPos = 0;
      typewriterDone = false;
      fadingOut = false;
      cursorVisible = true;

      // Render empty box (tagline not yet revealed)
      ctx.ui.setWidget(WIDGET_KEY, buildSplashLines("", 1.0, true));
      // Typewriter: reveal tagline char by char (~40 ms / char)
      typewriterTimer = setInterval(() => {
        typewriterPos++;
        if (typewriterPos > TAGLINE.length) {
          // Reveal complete — switch to cursor blink
          clearInterval(typewriterTimer!);
          typewriterTimer = null;
          typewriterDone = true;

          cursorTimer = setInterval(() => {
            cursorVisible = !cursorVisible;
            ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(TAGLINE, 1.0, cursorVisible));
          }, 400);
          return;
        }
        ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(TAGLINE.slice(0, typewriterPos), 1.0, true));
      }, 40);

      // Auto-dismiss after SPLASH_DURATION_MS
      splashTimer = setTimeout(() => dismissSplash(ctx), SPLASH_DURATION_MS);
    } else {
      ctx.ui.setWidget(WIDGET_KEY, BRAND_WIDGET);
    }
  });

  // User input → fast-forward typewriter then trigger fade-out
  pi.on("input", async (_event, ctx) => {
    if (!splashActive) return;
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
    typewriterPos = TAGLINE.length;
    typewriterDone = true;
    dismissSplash(ctx);
  });

  // ─── WORKING INDICATOR: custom dot pulse ─────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const theme = ctx.ui.theme;
    ctx.ui.setWorkingIndicator({
      frames: [
        theme.fg("dim", "·"),
        theme.fg("muted", "•"),
        theme.fg("accent", "●"),
        theme.fg("accent", "◉"),
        theme.fg("muted", "•"),
      ],
      intervalMs: 90,
    });
  });

  // ─── TOOL ICONS: override 4 built-ins ─────────────────────────────────────

  // Read: 🔍
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalRead.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const text =
        theme.fg("toolTitle", theme.bold(`${ICONS.read} read `)) +
        theme.fg("accent", args.path);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", `${ICONS.read} reading…`), 0, 0);
      const details = result.details as ReadToolDetails | undefined;
      const content = result.content[0];
      if (content?.type === "image") {
        return new Text(theme.fg("success", `${ICONS.read} image loaded`), 0, 0);
      }
      if (content?.type !== "text") {
        return new Text(theme.fg("error", `${ICONS.read} no content`), 0, 0);
      }
      const allLines = content.text.split("\n");
      const lineCount = allLines.length;
      let text = theme.fg("success", `${ICONS.read} ${lineCount} lines`);
      if (details?.truncation?.truncated) {
        text += theme.fg("warning", ` (truncated from ${details.truncation.totalLines})`);
      }
      const previewLines = expanded ? 15 : 5;
      const lines = allLines.slice(0, previewLines);
      for (const line of lines) text += `\n${theme.fg("dim", line)}`;
      if (lineCount > previewLines) {
        text += `\n${theme.fg("muted", `… ${lineCount - previewLines} more`)}`;
      }
      return new Text(text, 0, 0);
    },
  });

  // Write: 📝
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalWrite.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const lineCount = args.content.split("\n").length;
      const text =
        theme.fg("toolTitle", theme.bold(`${ICONS.write} write `)) +
        theme.fg("accent", args.path) +
        theme.fg("dim", ` (${lineCount} lines)`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", `${ICONS.write} writing…`), 0, 0);
      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", `${ICONS.write} ${content.text.split("\n")[0]}`), 0, 0);
      }
      let text = theme.fg("success", `${ICONS.write} written`);
      if (expanded) {
        const allLines = content?.type === "text" ? content.text.split("\n") : [];
        const previewLines = allLines.slice(0, 15);
        for (const line of previewLines) text += `\n${theme.fg("dim", line)}`;
        if (allLines.length > 15) {
          text += `\n${theme.fg("muted", `… ${allLines.length - 15} more`)}`;
        }
      }
      return new Text(text, 0, 0);
    },
  });

  // Edit: ✏️
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
    renderCall(args, theme) {
      const text =
        theme.fg("toolTitle", theme.bold(`${ICONS.edit} edit `)) +
        theme.fg("accent", args.path);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", `${ICONS.edit} editing…`), 0, 0);
      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", `${ICONS.edit} ${content.text.split("\n")[0]}`), 0, 0);
      }
      if (!details?.diff) {
        return new Text(theme.fg("success", `${ICONS.edit} applied`), 0, 0);
      }
      const diffLines = details.diff.split("\n");
      let additions = 0;
      let removals = 0;
      for (const line of diffLines) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) removals++;
      }
      let text = theme.fg("success", `${ICONS.edit} +${additions}`);
      text += theme.fg("dim", " / ");
      text += theme.fg("error", `-${removals}`);
      const previewLines = expanded ? 30 : 5;
      for (const line of diffLines.slice(0, previewLines)) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          text += `\n${theme.fg("success", line)}`;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          text += `\n${theme.fg("error", line)}`;
        } else {
          text += `\n${theme.fg("dim", line)}`;
        }
      }
      if (diffLines.length > previewLines) {
        text += `\n${theme.fg("muted", `… ${diffLines.length - previewLines} more`)}`;
      }
      return new Text(text, 0, 0);
    },
  });

  // Bash: ⚡
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalBash.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const cmd = args.command.length > 80 ? `${args.command.slice(0, 77)}…` : args.command;
      let text = theme.fg("toolTitle", theme.bold(`${ICONS.bash} $ `));
      text += theme.fg("accent", cmd);
      if (args.timeout) text += theme.fg("dim", ` (timeout: ${args.timeout}s)`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", `${ICONS.bash} running…`), 0, 0);
      const details = result.details as BashToolDetails | undefined;
      const content = result.content[0];
      const output = content?.type === "text" ? content.text : "";
      const exitMatch = output.match(/exit code: (\d+)/);
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;
      const allLines = output.split("\n").filter((l) => l.trim());
      const lineCount = allLines.length;
      let text = "";
      if (exitCode === 0 || exitCode === null) {
        text += theme.fg("success", `${ICONS.bash} done`);
      } else {
        text += theme.fg("error", `${ICONS.bash} exit ${exitCode}`);
      }
      text += theme.fg("dim", ` (${lineCount} lines)`);
      if (details?.truncation?.truncated) text += theme.fg("warning", " [truncated]");
      const previewLines = expanded ? 20 : 5;
      const lines = allLines.slice(0, previewLines);
      for (const line of lines) text += `\n${theme.fg("dim", line)}`;
      if (lineCount > previewLines) {
        text += `\n${theme.fg("muted", `… ${lineCount - previewLines} more`)}`;
      }
      return new Text(text, 0, 0);
    },
  });

  // ─── GENERIC CATCH-ALL: status bar shows current tool emoji ──────────────

  function iconFor(name: string): string {
    return (ICONS as Record<string, string>)[name] ?? ICON_DEFAULT;
  }

  function clearStatusSoon(ctx: ExtensionContext, ms: number) {
    setTimeout(() => {
      if (!currentTool) ctx.ui.setStatus(STATUS_KEY, undefined);
    }, ms);
  }

  pi.on("tool_execution_start", async (event, ctx) => {
    const icon = iconFor(event.toolName);
    currentTool = { name: event.toolName, icon };
    ctx.ui.setStatus(STATUS_KEY, `${icon} ${event.toolName}…`);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const tool = currentTool;
    currentTool = null;
    if (event.isError) {
      ctx.ui.setStatus(STATUS_KEY, `${tool?.icon ?? ICON_DEFAULT} ${tool?.name ?? "?"} ✗`);
      clearStatusSoon(ctx, 2500);
    } else {
      ctx.ui.setStatus(STATUS_KEY, `${tool?.icon ?? ICON_DEFAULT} ${tool?.name ?? "?"} ✓`);
      clearStatusSoon(ctx, 1800);
    }
  });

  // ─── AGENT PULSE: status bar during LLM streaming ─────────────────────────

  pi.on("agent_start", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, "⚡ thinking…");
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!currentTool) ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    if (splashTimer) clearTimeout(splashTimer);
    if (typewriterTimer) clearInterval(typewriterTimer);
    if (cursorTimer) clearInterval(cursorTimer);
    if (fadeTimer) clearInterval(fadeTimer);
    splashActive = false;
    fadingOut = false;
    currentTool = null;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
