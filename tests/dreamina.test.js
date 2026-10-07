const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pool } = require("../db/pool");
const cli = require("../engines/dreamina/cli");
const account = require("../engines/dreamina/account");
const sharp = require("sharp");
const videoEngine = require("../engines/dreamina/videoEngine");
const imageEngine = require("../engines/dreamina/imageEngine");
const { VIDEO_MODELS, IMAGE_MODELS } = require("../engines/dreamina/models");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Replaces the Dreamina CLI and the database for one test. `commands` maps a
 * command prefix ("node create video") to a handler returning
 * `{ exitCode, envelope }`; unmatched commands fail the test. `settings`
 * stands in for the settings table and `spendRows` for this month's
 * Dreamina generations.
 */
async function stub(t, { commands = {}, settings = {}, spendRows = [] } = {}) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-dreamina-test-"));
  const calls = [];
  const store = { dreamina_project_id: PROJECT_ID, dreamina_canvas_url: "https://dreamina.example.test/canvas", ...settings };
  const originalRun = cli.run;
  const originalInstalled = cli.installed;
  const originalQuery = pool.query;

  cli.installed = () => true;
  cli.run = async (args, options = {}) => {
    calls.push(args);
    const command = Object.keys(commands).sort((a, b) => b.length - a.length).find((prefix) => args.join(" ").startsWith(prefix));
    if (!command) throw new Error(`Unexpected command ${args.slice(0, 3).join(" ")}`);
    const result = await commands[command](args);
    if (result.exitCode && !(options.accept || []).includes(result.exitCode)) {
      throw new cli.DreaminaError(`exit ${result.exitCode}`, { exitCode: result.exitCode });
    }
    return { exitCode: 0, ...result };
  };
  pool.query = async (sql, params = []) => {
    if (sql.startsWith("SELECT key, value FROM settings")) {
      return { rows: params[0].filter((key) => store[key] != null).map((key) => ({ key, value: store[key] })) };
    }
    if (sql.startsWith("INSERT INTO settings")) {
      store[params[0]] = params[1];
      return { rows: [] };
    }
    if (sql.includes("FROM generations")) return { rows: spendRows };
    throw new Error(`Unexpected query ${sql}`);
  };
  account.clearReadiness();

  t.after(async () => {
    cli.run = originalRun;
    cli.installed = originalInstalled;
    pool.query = originalQuery;
    account.clearReadiness();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  return { calls, store, directory };
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** A run that Dreamina accepts, finishes and lets PoseForge download. */
function succeedingRun({ credits = 120 } = {}) {
  let count = 0;
  return {
    "resource upload": () => ({ envelope: { data: { resourceId: `upload-${++count}` } } }),
    "node create image": (args) => ({ envelope: { data: { node: { nodeId: `image-node-${flag(args, "--resource-id")}` } } } }),
    "node create video": (args) => ({ envelope: { data: { node: { nodeId: flag(args, "--resource-id") ? `video-node-${flag(args, "--resource-id")}` : "video-node" } } } }),
    "node create audio": (args) => ({ envelope: { data: { node: { nodeId: `audio-node-${flag(args, "--resource-id")}` } } } }),
    "operation wait": () => ({ envelope: { data: { state: "succeeded", resources: [{ resourceId: "video-resource", state: "succeeded" }] } } }),
    "node show": () => ({ envelope: { data: { nodes: [{ node: { resources: [{ submitId: GENERATION_ID, creditsAmount: credits }] } }] } } }),
    "resource download": async (args) => {
      await fs.promises.writeFile(flag(args, "--output"), Buffer.alloc(64));
      return { envelope: { data: { size: 64, sha256: "abc" } } };
    },
  };
}

test("exposes only Seedance 2.5, 2.0 and 2.0 Mini, with ids the video node menu can split", () => {
  assert.deepEqual([...new Set(VIDEO_MODELS.map((model) => model.model))], ["seedance_2.5", "seedance_2.0", "seedance_2.0_mini"]);
  const mini = VIDEO_MODELS.find((model) => model.id === "seedance_2.0_mini:m2v");
  assert.deepEqual(mini.resolutions, ["720p"]);
  assert.deepEqual([mini.maxReferences, mini.maxReferenceVideos, mini.maxReferenceAudios], [9, 3, 3]);
  assert.deepEqual(mini.inputs, ["prompt", "reference", "referenceVideo", "referenceAudio"]);
  for (const model of VIDEO_MODELS) assert.ok(!model.id.includes("::"), model.id);
  assert.equal(VIDEO_MODELS.find((model) => model.id === "seedance_2.5:m2v").maxReferences, 30);
  assert.equal(VIDEO_MODELS.find((model) => model.id === "seedance_2.0:t2v").maxReferences, undefined);
});

test("parses credit limits as whole, non-negative credits", () => {
  assert.equal(account.parseCredits("150"), 150);
  assert.equal(account.parseCredits(0), 0);
  assert.equal(account.parseCredits(""), null);
  assert.equal(account.parseCredits("1.5"), null);
  assert.equal(account.parseCredits("-3"), null);
});

test("refuses to quote without a per-video credit limit", async (t) => {
  await stub(t);
  await assert.rejects(videoEngine.quoteUsage({ model: "seedance_2.5:t2v", prompt: "a dancer" }), /credit limit per video/);
});

test("refuses a run that could exceed the monthly credit budget", async (t) => {
  await stub(t, {
    settings: { dreamina_credit_ceiling: "200", dreamina_monthly_credit_budget: "500" },
    spendRows: [{ usage_metrics: { estimatedCredits: 350 } }],
  });
  await assert.rejects(videoEngine.quoteUsage({ model: "seedance_2.5:t2v", prompt: "a dancer" }), /550, above your 500-credit monthly budget/);
});

test("quotes the per-video limit as the most a run may cost", async (t) => {
  await stub(t, { settings: { dreamina_credit_ceiling: "200" } });
  const usage = await videoEngine.quoteUsage({ model: "seedance_2.0:t2v", prompt: "a dancer" });
  assert.equal(usage.estimatedCredits, 200);
  assert.equal(usage.creditCeiling, 200);
  assert.equal(usage.billing, "dreamina");
});

test("runs text to video under the generation id with the credit ceiling and downloads the result", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_credit_ceiling: "200" }, commands: succeedingRun() });
  const outputPath = path.join(directory, "out.mp4");
  const result = await videoEngine.generateVideo({
    model: "seedance_2.5:t2v",
    prompt: "a dancer {{spins}}",
    duration: 8,
    aspectRatio: "9:16",
    resolution: "1080p",
    outputPath,
    idempotencyKey: GENERATION_ID,
  });

  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create video");
  assert.equal(flag(create, "--project-id"), PROJECT_ID);
  assert.equal(flag(create, "--model"), "seedance_2.5");
  assert.equal(flag(create, "--mode"), "t2v");
  assert.equal(flag(create, "--submit-id"), GENERATION_ID);
  assert.equal(flag(create, "--credit-ceiling"), "200");
  assert.equal(flag(create, "--duration"), "8");
  assert.equal(flag(create, "--ratio"), "9:16");
  assert.equal(flag(create, "--resolution"), "1080p");
  assert.equal(flag(create, "--prompt"), "a dancer \\{{spins}}");
  assert.ok(create.includes("--run"));
  assert.ok(!create.includes("--ref"));
  assert.ok(!calls.some((args) => args[0] === "resource" && args[1] === "upload"));

  assert.equal(result.usage.estimatedCredits, 120);
  assert.equal(result.usage.source, "provider-reported");
  assert.equal(result.usage.submitId, GENERATION_ID);
  assert.equal(fs.statSync(outputPath).size, 64);
});

test("falls back to the model's defaults for unsupported options", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_credit_ceiling: "200" }, commands: succeedingRun() });
  await videoEngine.generateVideo({
    model: "seedance_2.0:t2v",
    prompt: "a dancer",
    duration: 30,
    resolution: "480p",
    outputPath: path.join(directory, "out.mp4"),
    idempotencyKey: GENERATION_ID,
  });
  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create video");
  assert.equal(flag(create, "--duration"), "5");
  assert.equal(flag(create, "--resolution"), "720p");
  assert.equal(flag(create, "--ratio"), "16:9");
});

test("imports connected references as canvas image nodes for reference to video", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_credit_ceiling: "200" }, commands: succeedingRun() });
  const references = ["a.png", "b.png"].map((name) => path.join(directory, name));
  await videoEngine.generateVideo({
    model: "seedance_2.5:m2v",
    prompt: "a dancer",
    referencePaths: references,
    outputPath: path.join(directory, "out.mp4"),
    idempotencyKey: GENERATION_ID,
  });
  const uploads = calls.filter((args) => args[0] === "resource" && args[1] === "upload");
  assert.deepEqual(uploads.map((args) => flag(args, "--file")), references);
  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create video");
  assert.equal(create.filter((arg) => arg === "--ref").length, 2);
  assert.deepEqual(create.filter((arg) => arg.startsWith("node:")), ["node:image-node-upload-1", "node:image-node-upload-2"]);
});

test("imports reference videos and audio as canvas media nodes for reference to video", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_credit_ceiling: "200" }, commands: succeedingRun() });
  await videoEngine.generateVideo({
    model: "seedance_2.0:m2v",
    prompt: "a dancer",
    referencePaths: [path.join(directory, "a.png")],
    referenceVideoPaths: [path.join(directory, "move.mp4")],
    referenceAudioPaths: [path.join(directory, "beat.mp3")],
    outputPath: path.join(directory, "out.mp4"),
    idempotencyKey: GENERATION_ID,
  });
  const uploads = calls.filter((args) => args[0] === "resource" && args[1] === "upload");
  assert.deepEqual(uploads.map((args) => flag(args, "--type")), ["image", "video", "audio"]);
  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create video" && args.includes("--run"));
  assert.deepEqual(create.filter((arg) => arg.startsWith("node:")), ["node:image-node-upload-1", "node:video-node-upload-2", "node:audio-node-upload-3"]);
});

test("needs an image or video reference unless the model takes audio alone", async (t) => {
  await stub(t, { settings: { dreamina_credit_ceiling: "200" } });
  const audioOnly = { prompt: "a dancer", referenceAudioPaths: ["beat.mp3"] };
  await assert.rejects(videoEngine.quoteUsage({ model: "seedance_2.0:m2v", ...audioOnly }), /requires a connected reference image or video\./);
  await assert.rejects(videoEngine.quoteUsage({ model: "seedance_2.0_mini:m2v", prompt: "a dancer" }), /reference image or video/);
  await videoEngine.quoteUsage({ model: "seedance_2.5:m2v", ...audioOnly });
  await assert.rejects(
    videoEngine.quoteUsage({ model: "seedance_2.0:m2v", prompt: "a dancer", referenceVideoPaths: ["1", "2", "3", "4"].map((n) => `${n}.mp4`) }),
    /at most 3 reference videos/,
  );
  await assert.rejects(
    videoEngine.quoteUsage({ model: "seedance_2.5:t2v", prompt: "a dancer", referenceVideoPaths: ["move.mp4"] }),
    /does not take reference videos/,
  );
});

test("requires a start frame for first and last frame mode", async (t) => {
  await stub(t, { settings: { dreamina_credit_ceiling: "200" } });
  await assert.rejects(videoEngine.quoteUsage({ model: "seedance_2.5:first_last_frame", prompt: "a dancer" }), /requires a connected start frame/);
});

test("reports a run priced above the limit as not charged", async (t) => {
  const { calls, directory } = await stub(t, {
    settings: { dreamina_credit_ceiling: "100" },
    commands: {
      "node create video": () => ({
        exitCode: cli.EXIT.confirmationRequired,
        envelope: { ok: false, data: { node: { nodeId: "video-node" } }, creditConfirmation: { minimumCreditCeiling: 180 } },
      }),
    },
  });
  const error = await videoEngine.generateVideo({
    model: "seedance_2.5:t2v",
    prompt: "a dancer",
    outputPath: path.join(directory, "out.mp4"),
    idempotencyKey: GENERATION_ID,
  }).catch((cause) => cause);

  assert.match(error.message, /priced this video at 180 credits, above your 100-credit limit/);
  assert.match(error.message, /Nothing was charged/);
  assert.equal(error.usage.estimatedCredits, 0);
  assert.equal(error.usage.refunded, true);
  assert.equal(error.usage.quotedCredits, 180);
  assert.ok(!calls.some((args) => args[0] === "operation"));
});

test("counts a failed run at the credits Dreamina recorded", async (t) => {
  const { directory } = await stub(t, {
    settings: { dreamina_credit_ceiling: "200" },
    commands: {
      ...succeedingRun({ credits: 0 }),
      "operation wait": () => ({ envelope: { data: { state: "failed", resources: [{ resourceId: "video-resource", state: "failed" }], submissionError: { message: "Content blocked." } } } }),
    },
  });
  const error = await videoEngine.generateVideo({
    model: "seedance_2.5:t2v",
    prompt: "a dancer",
    outputPath: path.join(directory, "out.mp4"),
    idempotencyKey: GENERATION_ID,
  }).catch((cause) => cause);
  assert.equal(error.message, "Content blocked.");
  assert.equal(error.usage.estimatedCredits, 0);
});

test("creates the PoseForge canvas once, reusing the saved project id on retry", async (t) => {
  let attempts = 0;
  const { calls, store } = await stub(t, {
    settings: { dreamina_project_id: "", dreamina_canvas_url: "" },
    commands: {
      "canvas create": (args) => {
        attempts += 1;
        if (attempts === 1) return { exitCode: cli.EXIT.serviceFailure };
        return { envelope: { data: { project: { projectId: flag(args, "--project-id"), webUrl: "https://dreamina.example.test/new" } } } };
      },
    },
  });
  await assert.rejects(account.createCanvas());
  const canvas = await account.createCanvas();
  const [first, second] = calls.map((args) => flag(args, "--project-id"));
  assert.equal(first, second);
  assert.equal(canvas.projectId, first);
  assert.equal(store.dreamina_project_id, first);
  assert.equal(store.dreamina_pending_project_id, "");
  assert.equal(calls[0][2], "PoseForge");

  await account.createCanvas();
  assert.equal(calls.length, 2);
});

/** An image run whose download is a JPEG, as Dreamina may return. */
function succeedingImageRun() {
  return {
    ...succeedingRun({ credits: 6 }),
    "node create image --project-id": (args) => args.includes("--run")
      ? { envelope: { data: { node: { nodeId: "image-gen-node" } } } }
      : { envelope: { data: { node: { nodeId: `image-node-${flag(args, "--resource-id")}` } } } },
    "resource download": async (args) => {
      const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).jpeg().toBuffer();
      await fs.promises.writeFile(flag(args, "--output"), buffer);
      return { envelope: { data: { size: buffer.length } } };
    },
  };
}

test("exposes only Seedream and GPT Image models for images", () => {
  for (const model of IMAGE_MODELS) assert.match(model.id, /^(seedream_|gpt_image_|dreamina_gpt_image_)/);
  assert.equal(IMAGE_MODELS[0].id, "seedream_5.0_pro");
  assert.equal(imageEngine.capabilities.maxReferenceImages, 16);
});

test("image runs use the per-image limit, not the per-video one", async (t) => {
  await stub(t, {
    settings: { dreamina_credit_ceiling: "200" },
    commands: { "auth status": () => ({ envelope: { data: { loggedIn: true } } }) },
  });
  assert.deepEqual(await videoEngine.isReady(), { ready: true });
  await assert.rejects(imageEngine.quoteUsage({ model: "gpt_image_2", prompt: "a dancer" }), /credit limit per image/);
  assert.deepEqual(await imageEngine.isReady(), { ready: false, reason: "Set a Dreamina credit limit per image in Settings." });
});

test("runs text to image with the image ceiling and saves the result as PNG", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_image_credit_ceiling: "20" }, commands: succeedingImageRun() });
  const outputPath = path.join(directory, "out.png");
  const result = await imageEngine.generateFreeform({
    model: "seedream_5.0_pro",
    prompt: "a dancer",
    outputPath,
    outputSettings: { aspectRatio: "3:2", quality: "medium" },
    idempotencyKey: GENERATION_ID,
  });
  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create image" && args.includes("--run"));
  assert.equal(flag(create, "--mode"), "t2i");
  assert.equal(flag(create, "--model"), "seedream_5.0_pro");
  assert.equal(flag(create, "--ratio"), "3:2");
  assert.equal(flag(create, "--resolution"), "1.5K");
  assert.equal(flag(create, "--credit-ceiling"), "20");
  assert.equal(flag(create, "--submit-id"), GENERATION_ID);
  assert.equal((await sharp(outputPath).metadata()).format, "png");
  assert.ok(!fs.existsSync(`${outputPath}.dreamina`));
  assert.equal(result.usage.estimatedCredits, 6);
});

test("runs image to image with connected references and maps detail tiers", async (t) => {
  const { calls, directory } = await stub(t, { settings: { dreamina_image_credit_ceiling: "20" }, commands: succeedingImageRun() });
  await imageEngine.generateFreeform({
    model: "gpt_image_2",
    prompt: "a dancer",
    referencePaths: [path.join(directory, "a.png")],
    outputPath: path.join(directory, "out.png"),
    outputSettings: { aspectRatio: "5:4", quality: "max" },
    idempotencyKey: GENERATION_ID,
  });
  const create = calls.find((args) => args.slice(0, 3).join(" ") === "node create image" && args.includes("--run"));
  assert.equal(flag(create, "--mode"), "i2i");
  assert.equal(flag(create, "--resolution"), "4K");
  assert.equal(flag(create, "--ratio"), "1:1");
  assert.deepEqual(create.filter((arg) => arg.startsWith("node:")), ["node:image-node-upload-1"]);
});

test("enforces each image model's own reference limit", async (t) => {
  await stub(t, { settings: { dreamina_image_credit_ceiling: "20" } });
  const referencePaths = Array.from({ length: 7 }, (_, index) => `/tmp/${index}.png`);
  await assert.rejects(imageEngine.quoteUsage({ model: "seedream_4.5", prompt: "a dancer", referencePaths }), /at most 6 reference images/);
});

test("prices a refused run from the saved node when the refusal omits the amount", async (t) => {
  const { calls, directory } = await stub(t, {
    settings: { dreamina_image_credit_ceiling: "1" },
    commands: {
      ...succeedingImageRun(),
      "node create image --project-id": (args) => args.includes("--run")
        ? { exitCode: cli.EXIT.confirmationRequired, envelope: { ok: false, error: { code: "cli.generation_confirmation_required" } } }
        : { envelope: { data: { node: { nodeId: `image-node-${flag(args, "--resource-id")}` } } } },
      "node quote": () => ({ envelope: { data: { items: [{ maxCredits: 6 }], totalMaxCredits: 6 } } }),
    },
  });
  const error = await imageEngine.generateFreeform({
    model: "seedream_5.0_lite",
    prompt: "a dancer",
    outputPath: path.join(directory, "out.png"),
    idempotencyKey: GENERATION_ID,
  }).catch((cause) => cause);

  const create = calls.find((args) => args.includes("--run"));
  const nodeId = flag(create, "--node-id");
  assert.match(nodeId, /^node_[0-9abcdefghjkmnpqrstvwxyz]{10}$/);
  assert.equal(flag(calls.find((args) => args[1] === "quote"), "--node-id"), nodeId);
  assert.match(error.message, /priced this image at 6 credits, above your 1-credit limit per image/);
  assert.equal(error.usage.estimatedCredits, 0);
  assert.equal(error.usage.nodeId, nodeId);
});
