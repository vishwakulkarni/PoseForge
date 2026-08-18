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
    src: "docs/TROUBLESHOOTING.md",
    slug: "troubleshooting",
    title: "Troubleshooting and FAQ",
    description: "Setup, database, pose library, engine, and generation troubleshooting.",
  },
  {
    src: "docs/COMPATIBILITY.md",
    slug: "compatibility",
    title: "Compatibility",
    description: "Tested platforms, engine requirements, and local hardware guidance.",
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
    src: "SUPPORT.md",
    slug: "support",
    title: "Support",
    description: "Where to ask for help and which safe diagnostics to include.",
  },
  {
    src: "ROADMAP.md",
    slug: "roadmap",
    title: "Roadmap",
    description: "Current priorities, future direction, and how work is selected.",
  },
  {
    src: "PRIVACY.md",
    slug: "privacy",
    title: "Privacy and data flow",
    description: "Engine data flow, local storage, credentials, logs, and telemetry.",
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

const DOC_ROUTES = new Map(
  DOCUMENTS.map((doc) => [path.posix.normalize(doc.src), `/docs/${doc.slug}`]),
);

/**
 * Repository markdown links are relative to their source files. Once mirrored
 * into /docs/<slug>, those same hrefs resolve from a different directory and
 * become 404s. Translate links to known documents into canonical app routes;
 * absolute URLs, anchors, assets, and code examples remain untouched.
 */
function rewriteDocumentLinks(markdown, doc) {
  let insideFence = false;
  const sourceDirectory = path.posix.dirname(doc.src);

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence) return line;

      return line.replace(/(\[[^\]]*\]\()([^\s)]+)([^)]*\))/g, (match, opening, destination, closing) => {
        if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(destination)) return match;

        const hashIndex = destination.indexOf("#");
        const pathname = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
        const hash = hashIndex === -1 ? "" : destination.slice(hashIndex);
        const resolved = path.posix.normalize(path.posix.join(sourceDirectory, pathname));
        const route = DOC_ROUTES.get(resolved);
        return route ? `${opening}${route}${hash}${closing}` : match;
      });
    })
    .join("\n");
}

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
    escapeForMdx(rewriteDocumentLinks(body, doc))
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

if (require.main === module) main();

module.exports = {
  DOCUMENTS,
  rewriteDocumentLinks,
};
