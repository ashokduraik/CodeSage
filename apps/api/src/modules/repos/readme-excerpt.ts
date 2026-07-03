import { README_EXCERPT_MAX } from "./repo-url";

/**
 * Strips HTML tags and common entities from README text.
 *
 * @param raw - README body that may contain HTML markup.
 * @returns Plain text with normalized whitespace.
 */
function stripHtmlFromReadme(raw: string): string {
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
    const hashes = "#".repeat(Number(level));
    const title = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return `\n${hashes} ${title}\n`;
  });

  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

/**
 * Removes common inline Markdown decorations from a single line.
 *
 * @param line - One line of README text.
 * @returns Line with images/links/formatting reduced to plain text.
 */
function cleanMarkdownLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*+]\s+/, "")
    .trim();
}

/**
 * Extracts the first README section as plain text for the connect dialog.
 * Stops at the next heading and strips HTML or Markdown styling.
 *
 * @param raw - Full README body from the provider API.
 * @param maxLen - Maximum stored length (defaults to {@link README_EXCERPT_MAX}).
 * @returns First-section plain-text excerpt, or empty string when none found.
 */
export function extractReadmeFirstSection(
  raw: string,
  maxLen: number = README_EXCERPT_MAX,
): string {
  if (!raw.trim()) {
    return "";
  }

  let text = raw.replace(/\r\n/g, "\n");
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = stripHtmlFromReadme(text);
  }

  text = text.replace(/^---\n[\s\S]*?\n---\n?/, "");

  const lines = text.split("\n");
  const parts: string[] = [];
  let skippedTitle = false;
  let started = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,6})\s+/);

    if (heading) {
      const level = heading[1]!.length;
      if (level === 1 && !skippedTitle) {
        skippedTitle = true;
        continue;
      }
      if (started) {
        break;
      }
      continue;
    }

    if (!line) {
      if (started) {
        parts.push("");
      }
      continue;
    }

    if (/^!\[.*\]\(.*\)\s*$/.test(line)) {
      continue;
    }
    if (/^\[!\[.*\]\(.*\)\]\(.*\)\s*$/.test(line)) {
      continue;
    }

    const cleaned = cleanMarkdownLine(line);
    if (!cleaned) {
      continue;
    }

    parts.push(cleaned);
    started = true;
  }

  let result = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (result.length > maxLen) {
    result = result.slice(0, maxLen).trim();
  }

  return result;
}
