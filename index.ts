/**
 * Higgsfield API example — Seedance 2.5 text-to-video.
 *
 * Server-side only. Credentials are read from .env.local (HF_CREDENTIALS, in
 * "key-id:key-secret" form) at runtime and never logged.
 *
 * Run with: npm run higgsfield:example
 */
import { config as loadEnv } from "dotenv";
import { config as configureHiggsfield, higgsfield } from "@higgsfield/client/v2";

loadEnv({ path: ".env.local", quiet: true });

const MODEL = "bytedance/seedance-2.5/text-to-video";

function readCredentials(): string {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials) {
    throw new Error(
      "HF_CREDENTIALS is missing. Add HF_CREDENTIALS=key-id:key-secret to .env.local " +
        "(get keys at https://console.higgsfield.ai). The file is git-ignored.",
    );
  }
  // Shape check only — never print or log the value itself.
  const [keyId, keySecret, ...rest] = credentials.split(":");
  if (!keyId || !keySecret || rest.length > 0) {
    throw new Error("HF_CREDENTIALS must be in key-id:key-secret format.");
  }
  return credentials;
}

async function main(): Promise<void> {
  configureHiggsfield({ credentials: readCredentials() });

  console.log(`Submitting ${MODEL} request…`);
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  console.log(`Request ${result.request_id} finished with status: ${result.status}`);

  // Terminal states per https://docs.higgsfield.ai/docs/concepts/requests.md
  switch (result.status as string) {
    case "completed": {
      const url = result.video?.url;
      if (!url) {
        throw new Error("Request completed but no video URL was returned.");
      }
      console.log(`Video URL: ${url}`);
      console.log("Output URLs are retained for at least 7 days — copy it if you need it longer.");
      return;
    }
    case "failed":
      throw new Error(
        `Generation failed: ${JSON.stringify((result as { error?: unknown }).error ?? "no error detail returned")}`,
      );
    case "nsfw":
      throw new Error("Rejected by content moderation (status: nsfw). No video was produced.");
    case "canceled":
      throw new Error("Request was canceled before processing started. No video was produced.");
    default:
      throw new Error(`Request ended in an unexpected state: ${result.status}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
