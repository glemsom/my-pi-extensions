/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Branded splash on session start (typewriter reveal + fade-out)
 *   - Tool icons (🔍 read · 📝 write · ✏️ edit · ⚡ bash) inline in chat
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
  keyHint,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — tweak these to taste
// ─────────────────────────────────────────────────────────────────────────────

const TAGLINE = "pi-my-look";

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getDot(context: any, theme: any): string {
  if (context?.isPartial) {
    return theme.fg("warning", "●");
  }
  if (context?.isError) {
    return theme.fg("error", "●");
  }
  return theme.fg("success", "●");
}

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
const SPLASH_DURATION_MS = 2500;

// ─── WORKING INDICATOR: Knight Rider amber scan on "thinking…" ────────

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const THINKING_TEXT = "thinking…";
const KR_PEAK = { r: 0, g: 255, b: 255 };     // bright cyan (hot spot)
const KR_BASE = { r: 20, g: 60, b: 70 };      // dark teal (cold / off state)

/**
 * Build combined frames: braille spinner + Knight Rider scanning text.
 * Each frame shifts the amber "hot spot" across the thinking label — the glow
 * sweeps left-to-right and wraps, just like the KITT scanner.  Characters far
 * from the hot spot fade toward dark blue instead of black so they stay readable.
 */
function knightRiderThinkingFrames(): string[] {
  const textLen = THINKING_TEXT.length;
  const frameCount = BRAILLE_FRAMES.length;

  return BRAILLE_FRAMES.map((braille, i) => {
    // Map frame index → scan position along the text (linear sweep)
    const scanPos = (i / (frameCount - 1)) * (textLen - 1);

    let colored = "";
    for (let c = 0; c < textLen; c++) {
      const dist = Math.abs(c - scanPos);
      const t = Math.max(0, 1 - dist / 2.5);  // 1 = hot spot, 0 = far away
      const r = Math.round(KR_BASE.r + (KR_PEAK.r - KR_BASE.r) * t);
      const g = Math.round(KR_BASE.g + (KR_PEAK.g - KR_BASE.g) * t);
      const b = Math.round(KR_BASE.b + (KR_PEAK.b - KR_BASE.b) * t);
      colored += `\x1b[38;2;${r};${g};${b}m${THINKING_TEXT[c]}\x1b[39m`;
    }
    return `${braille} ${colored}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // State
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
    // Knight Rider amber scanning text on the thinking indicator
    ctx.ui.setWorkingIndicator({
      frames: knightRiderThinkingFrames(),
    });
    ctx.ui.setWorkingMessage("");

    if (event.reason === "startup" || event.reason === "new") {
      if (splashActive) dismissSplash(ctx);
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

  // ─── TOOL ICONS: override 4 built-ins ─────────────────────────────────────

  // Invisible placeholder returned by renderResult when nothing to show.
  const EMPTY: { render: () => string[]; invalidate: () => void } = { render: () => [], invalidate: () => {} };

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
      let text = `${dot} ${title}(${path})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

      const details = result.details as ReadToolDetails | undefined;
      const content = result.content[0];

      // Compute stats line
      let stats = "";
      if (content?.type === "image") {
        stats = "image loaded";
      } else if (content?.type !== "text") {
        stats = "no content";
      } else {
        const allLines = content.text.split("\n");
        stats = `${allLines.length} lines`;
        if (details?.truncation?.truncated) stats += ` (truncated from ${details.truncation.totalLines})`;
      }

      // Build result: preview (15 lines expanded); stats only when expanded
      let resultText = "";

      if (content?.type === "text") {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = 15;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
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
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

      const content = result.content[0];
      let stats: string;
      if (content?.type === "text" && content.text.startsWith("Error")) {
        stats = content.text.split("\n")[0]!;
      } else {
        stats = "written";
      }

      // Build result: preview (15 lines expanded)
      let resultText = "";

      if (content?.type === "text" && !content.text.startsWith("Error")) {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = 15;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Edit
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
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      // Compute stats line
      let stats: string;
      if (content?.type === "text" && content.text.startsWith("Error")) {
        stats = content.text.split("\n")[0]!;
      } else if (!details?.diff) {
        stats = "applied";
      } else {
        const diffLines = details.diff.split("\n");
        let additions = 0;
        let removals = 0;
        for (const line of diffLines) {
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          if (line.startsWith("-") && !line.startsWith("---")) removals++;
        }
        stats = `+${additions} / -${removals}`;
      }

      // Build result: diff preview (30 lines expanded)
      let resultText = "";

      if (details?.diff) {
        const diffLines = details.diff.split("\n");
        const lineCount = diffLines.length;
        const previewLines = 30;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          for (const line of diffLines.slice(0, previewLines)) {
            if (line.startsWith("+") && !line.startsWith("+++")) {
              resultText += `\n${theme.fg("success", line)}`;
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              resultText += `\n${theme.fg("error", line)}`;
            } else {
              resultText += `\n${theme.fg("dim", line)}`;
            }
          }
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
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
      if (isPartial || !expanded) return EMPTY;

      const details = result.details as BashToolDetails | undefined;
      const content = result.content[0];
      const output = content?.type === "text" ? content.text : "";
      const exitMatch = output.match(/exit code: (\d+)/);
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;
      const allLines = output.split("\n").filter((l) => l.trim());
      const lineCount = allLines.length;

      // Compute stats line
      let stats = "";
      if (exitCode === 0 || exitCode === null) {
        stats += "done";
      } else {
        stats += `exit ${exitCode}`;
      }
      stats += ` (${lineCount} lines)`;
      if (details?.truncation?.truncated) stats += " [truncated]";

      // Build result: output preview (20 lines expanded)
      let resultText = "";

      const previewLines = 20;
      if (lineCount > 0) {
        resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
        const lines = allLines.slice(0, previewLines);
        for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
        if (lineCount > previewLines) {
          const remaining = lineCount - previewLines;
          resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    if (splashTimer) clearTimeout(splashTimer);
    if (typewriterTimer) clearInterval(typewriterTimer);
    if (cursorTimer) clearInterval(cursorTimer);
    if (fadeTimer) clearInterval(fadeTimer);
    splashActive = false;
    fadingOut = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
