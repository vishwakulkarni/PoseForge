const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const client = require("../engines/higgsfield/client");
const billing = require("../engines/higgsfield/billing");
const videoEngine = require("../engines/higgsfield/videoEngine");
const imageEngine = require("../engines/higgsfield/imageEngine");

const KEY = "key-id:key-secret";
const ESTIMATE = { type: "estimate", credits: "4.760", usd: "0.298", discount: null };

/**
 * Replaces the network and the database for one test. `routes` maps a URL
 * suffix to a handler returning a Response; unmatched URLs fail the test.
 * `settings` and `spendRows` stand in for the settings table and this
 * month's Higgsfield generations.
 */
async function stub(t, { routes = {}, settings = {}, spendRows = [] } = {}) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-higgsfield-test-"));
  const framePath = path.join(directory, "frame.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#7467ff" } }).png().toFile(framePath);

  const calls = [];
  const originalFetch = global.fetch;
  const originalQuery = pool.query;
  const originalEnv = process.env.HF_CREDENTIALS;
  delete process.env.HF_CREDENTIALS;

  let uploads = 0;
  const defaults = {
    "/files/generate-upload-url": () => {
      uploads += 1;
      return Response.json({
        public_url: `https://cdn.example.test/frame-${uploads}.png`,
        upload_url: `https://storage.example.test/upload-${uploads}`,
        upload_headers: { "Content-Type": "image/png" },
      });
    },
    "storage.example.test": () => new Response(null, { status: 200 }),
  };
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options, body: typeof options.body === "string" ? JSON.parse(options.body) : null });
    const handlers = { ...defaults, ...routes };
    const match = Object.keys(handlers).sort((a, b) => b.length - a.length).find((suffix) => href.includes(suffix));
    if (!match) throw new Error(`Unexpected fetch ${href}`);
    return handlers[match](href, options);
  };
  pool.query = async (sql, params = []) => {
    if (/FROM settings/.test(sql)) {
      const keys = Array.isArray(params[0]) ? params[0] : [params[0]];
      return { rows: keys.filter((key) => key in settings).map((key) => ({ key, value: settings[key] })) };
    }
    if (/FROM generations/.test(sql)) return { rows: spendRows.map((usage) => ({ usage_metrics: usage })) };
    throw new Error(`Unexpected query ${sql}`);
  };
  t.after(async () => {
    global.fetch = originalFetch;
    pool.query = originalQuery;
    if (originalEnv === undefined) delete process.env.HF_CREDENTIALS;
    else process.env.HF_CREDENTIALS = originalEnv;
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  return { calls, framePath, outputPath: path.join(directory, "output.bin") };
}

const apiCalls = (calls) => calls.filter((call) => call.url.startsWith(client.API_URL));

test("credentials must be key-id:key-secret", () => {
  assert.equal(client.validCredentials(KEY), true);
  assert.equal(client.validCredentials("only-one-part"), false);
  assert.equal(client.validCredentials("a:b:c"), false);
  assert.equal(client.validCredentials("a: b"), false);
});

test("image-to-video quotes, uploads, submits idempotently and records the quoted cost", async (t) => {
  const model = "bytedance/seedance-2.5/image-to-video";
  const { calls, framePath, outputPath } = await stub(t, {
    routes: {
      [`/estimate/${model}`]: () => Response.json(ESTIMATE),
      // An idempotent replay can return a finished request straight away.
      [`/${model}`]: () => Response.json({ request_id: "hf-1", status: "completed", video: { url: "https://media.example.test/out.mp4" } }),
      "media.example.test": () => new Response(Buffer.from("fake-mp4")),
    },
  });

  const result = await videoEngine.generateVideo({
    model,
    prompt: "A slow turn",
    startFramePath: framePath,
    endFramePath: framePath,
    duration: 10,
    aspectRatio: "16:9",
    resolution: "1080p",
    sound: true,
    outputPath,
    apiKey: KEY,
    idempotencyKey: "generation-1",
  });

  const submission = calls.find((call) => call.url === `${client.API_URL}/${model}`);
  assert.equal(submission.options.headers.Authorization, `Key ${KEY}`);
  assert.equal(submission.options.headers["Idempotency-Key"], "generation-1");
  assert.deepEqual(submission.body, {
    prompt: "A slow turn",
    duration: 10,
    resolution: "1080p",
    generate_audio: true,
    image_url: "https://cdn.example.test/frame-1.png",
    end_image_url: "https://cdn.example.test/frame-2.png",
  });
  // Credentials go to the API only, never to presigned storage or the CDN.
  for (const call of calls.filter((entry) => !entry.url.startsWith(client.API_URL))) {
    assert.equal(call.options.headers?.Authorization, undefined);
  }
  assert.equal(fs.readFileSync(outputPath, "utf8"), "fake-mp4");
  assert.equal(result.usage.estimatedCostUsd, 0.298);
  assert.equal(result.usage.estimatedCredits, 4.76);
  assert.equal(result.usage.pricingSource, "higgsfield-estimate");
  assert.equal(result.usage.providerRequestId, "hf-1");
});

test("a description-only estimate falls back to the published per-second rate", async (t) => {
  const model = "bytedance/seedance-2.5/text-to-video";
  await stub(t, {
    routes: { [`/estimate/${model}`]: () => Response.json({ type: "description", pricing_description: "Per second" }) },
  });
  const usage = await videoEngine.quoteUsage({ model, prompt: "x", duration: 10, resolution: "720p", apiKey: KEY });
  assert.equal(usage.pricingSource, "published-rate");
  assert.equal(usage.estimatedCostUsd, 4.622);
});

test("spending limits refuse a run before anything is uploaded or submitted", async (t) => {
  const model = "bytedance/seedance-2.5/image-to-video";
  const { calls, framePath, outputPath } = await stub(t, {
    routes: { [`/estimate/${model}`]: () => Response.json({ ...ESTIMATE, usd: "3.000" }) },
    settings: { [billing.LIMIT_SETTINGS.maxUsdPerGeneration]: "2" },
  });
  await assert.rejects(
    videoEngine.generateVideo({ model, prompt: "x", startFramePath: framePath, outputPath, apiKey: KEY }),
    (error) => error.code === "spend-limit" && /\$2\.00 per-generation limit/.test(error.message),
  );
  assert.deepEqual(apiCalls(calls).map((call) => call.url), [`${client.API_URL}/estimate/${model}`]);
});

test("the monthly budget counts this month's recorded spend", async (t) => {
  await stub(t, {
    settings: { [billing.LIMIT_SETTINGS.monthlyBudgetUsd]: "10" },
    spendRows: [{ estimatedCostUsd: 6, estimatedCredits: 96 }, { estimatedCostUsd: 0, refunded: true }, { estimatedCostUsd: 3.5 }],
  });
  assert.deepEqual(await billing.monthToDateSpend(), { usd: 9.5, credits: 96, runs: 3 });
  await billing.authorize({ estimatedCostUsd: 0.5 });
  await assert.rejects(billing.authorize({ estimatedCostUsd: 0.6 }), /monthly budget/);
});

test("with a limit set, a request that cannot be priced is refused", async (t) => {
  await stub(t, { settings: { [billing.LIMIT_SETTINGS.monthlyBudgetUsd]: "50" } });
  await assert.rejects(billing.authorize({ estimatedCostUsd: null }), (error) => error.code === "spend-limit");
});

test("without limits, any priced or unpriced request is allowed", async (t) => {
  await stub(t);
  await billing.authorize({ estimatedCostUsd: null });
  await billing.authorize({ estimatedCostUsd: 1_000 });
});

test("a failed generation is recorded as not charged", async (t) => {
  const model = "xai/grok-imagine-image-2.0";
  const { outputPath } = await stub(t, {
    routes: {
      [`/estimate/${model}`]: () => Response.json(ESTIMATE),
      [`/${model}`]: () => Response.json({ request_id: "hf-2", status: "nsfw" }),
    },
  });
  await assert.rejects(
    imageEngine.generateFreeform({ model, prompt: "x", outputPath, apiKey: KEY, idempotencyKey: "generation-2" }),
    (error) => {
      assert.equal(error.charged, false);
      assert.match(error.message, /No credits were charged/);
      assert.equal(error.usage.estimatedCostUsd, 0);
      assert.equal(error.usage.quotedCostUsd, 0.298);
      assert.equal(error.usage.refunded, true);
      return true;
    },
  );
});

test("insufficient credits are reported with a top-up link and nothing is charged", async (t) => {
  const model = "xai/grok-imagine-image-2.0";
  const { outputPath } = await stub(t, {
    routes: {
      [`/estimate/${model}`]: () => Response.json(ESTIMATE),
      [`/${model}`]: () => Response.json({ detail: "Not enough credits" }, { status: 403 }),
    },
  });
  await assert.rejects(
    imageEngine.generateFreeform({ model, prompt: "x", outputPath, apiKey: KEY }),
    (error) => error.code === "insufficient-credits" && error.message.includes(client.CONSOLE_URL) && error.usage.estimatedCostUsd === 0,
  );
});

test("text-to-image sends the mapped resolution and converts the output to PNG", async (t) => {
  const model = "higgsfield-ai/soul/v2/standard";
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const { calls, framePath, outputPath } = await stub(t, {
    routes: {
      [`/estimate/${model}`]: () => Response.json(ESTIMATE),
      [`/${model}`]: () => Response.json({ request_id: "hf-3", status: "completed", images: [{ url: "https://media.example.test/out.jpg" }] }),
      "media.example.test": () => new Response(jpeg),
    },
  });
  await imageEngine.generateFreeform({
    model,
    prompt: "Portrait",
    referencePaths: [framePath],
    outputSettings: { aspectRatio: "3:4", quality: "high" },
    outputPath,
    apiKey: KEY,
  });
  const submission = calls.find((call) => call.url === `${client.API_URL}/${model}`);
  // Soul is prompt-only, so connected references are not uploaded or sent.
  assert.deepEqual(submission.body, { prompt: "Portrait", resolution: "1080p", aspect_ratio: "3:4" });
  assert.equal(calls.some((call) => call.url.includes("generate-upload-url")), false);
  assert.equal((await sharp(outputPath).metadata()).format, "png");
});

test("verifying credentials uses the free estimate endpoint", async (t) => {
  const { calls } = await stub(t, {
    routes: { "/estimate/": () => Response.json({ detail: "Unauthorized" }, { status: 401 }) },
  });
  assert.deepEqual(await client.verifyCredentials("bad"), {
    ok: false,
    code: "format",
    message: "Credentials must be in key-id:key-secret format.",
  });
  const result = await client.verifyCredentials(KEY);
  assert.equal(result.ok, false);
  assert.equal(result.code, "auth");
  assert.ok(apiCalls(calls).every((call) => call.url.includes("/estimate/")));
});

test("polling only sends credentials to the API host", async (t) => {
  const { calls } = await stub(t, {
    routes: { "/requests/hf-4/status": () => Response.json({ request_id: "hf-4", status: "completed" }) },
  });
  const result = await client.waitForResult(KEY, { request_id: "hf-4", status: "queued", status_url: "https://evil.example.test/status" }, { pollIntervalMs: 1 });
  assert.equal(result.status, "completed");
  assert.deepEqual(calls.map((call) => call.url), [`${client.API_URL}/requests/hf-4/status`]);
});

test("a request still queued at the timeout is canceled and not charged", async (t) => {
  await stub(t, {
    routes: {
      "/requests/hf-5/status": () => Response.json({ request_id: "hf-5", status: "queued" }),
      "/requests/hf-5/cancel": () => new Response(null, { status: 202 }),
    },
  });
  await assert.rejects(
    client.waitForResult(KEY, { request_id: "hf-5", status: "queued" }, { timeoutMs: 5, pollIntervalMs: 2, maxPollIntervalMs: 2 }),
    (error) => error.code === "timeout" && error.charged === false,
  );
});
