#!/usr/bin/env node
/**
 * Mirrors the repository's markdown into web/content/docs as MDX, so the
 * in-app documentation at /docs never drifts from the files contributors
 * actually edit.
 *
 * Run it after changing any of the source documents:
 *
 *     npm run docs:sync
 *
 * The generated .mdx files are committed so the site builds without a
 * pre-build step; CI re-runs this and fails if the output is stale.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "web", "content", "docs");

const DOCUMENTS = [
  {
    src: "docs/USER_GUIDE.md",
    slug: "user-guide",
    title: "User guide",
    description: "Studio, ID Photos, libraries, engines, privacy, and troubleshooting.",
  },
  {
    src: "docs/METRICS.md",
    slug: "metrics",
    title: "Metrics reference",
    description: "Definitions for cost, tokens, latency, scopes, estimates, and exports.",
  },
  {
    src: "ARCHITECTURE.md",
    slug: "architecture",
    title: "Architecture",
    description:
      "How PoseForge is put together: the two processes, the data model, and the engine adapter pattern.",
  },
  {
    src: "CONTRIBUTING.md",
    slug: "contributing",
    title: "Contributing",
    description: "Local setup, the test layers, and how to get a change merged.",
  },
  {
    src: "SECURITY.md",
    slug: "security",
    title: "Security",
    description: "Threat model, credential handling, and how to report a vulnerability.",
  },
  {
    src: "CREDITS.md",
    slug: "credits",
    title: "Credits",
    description: "Attribution for curated pose imagery and third-party dependencies.",
  },
  {
    src: "engines/engineInterface.md",
    slug: "engine-interface",
    title: "Engine interface",
    description: "The adapter contract every generation engine implements.",
  },
];

/**
 * MDX treats `{` as an expression and `<` as JSX. Escaping them in prose
 * keeps arbitrary markdown safe, while fenced code blocks pass through
 * untouched so examples still render verbatim.
 */
function escapeForMdx(markdown) {
  let insideFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence) return line;
      return line
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;")
        .replace(/<(?![a-zA-Z/!])/g, "&lt;");
    })
    .join("\n");
}

/** Frontmatter values must be quoted: an unquoted colon is invalid YAML. */
function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function build(doc) {
  const sourcePath = path.join(ROOT, doc.src);
  if (!fs.existsSync(sourcePath)) return null;

  const raw = fs.readFileSync(sourcePath, "utf8");
  // Drop the leading H1 — Fumadocs renders the frontmatter title instead.
  const body = raw.replace(/^#\s+.+\n+/, "");

  return (
    `---\ntitle: ${quote(doc.title)}\ndescription: ${quote(doc.description)}\n---\n\n` +
    escapeForMdx(body)
  );
}

function main() {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let stale = 0;

  for (const doc of DOCUMENTS) {
    const contents = build(doc);
    if (contents === null) {
      console.warn(`skip  ${doc.src} (not found)`);
      continue;
    }

    const target = path.join(OUT_DIR, `${doc.slug}.mdx`);
    const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;

    if (existing === contents) {
      if (!check) console.log(`ok    ${doc.slug}.mdx`);
      continue;
    }

    if (check) {
      console.error(`stale ${doc.slug}.mdx — run "npm run docs:sync"`);
      stale += 1;
      continue;
    }

    fs.writeFileSync(target, contents);
    console.log(`write ${doc.slug}.mdx`);
  }

  if (stale) process.exit(1);
}

main();
