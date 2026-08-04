const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeComfyEndpoint,
  validateWorkflowContract,
  renderWorkflowTemplate,
  uploadedImageName,
  firstOutputImage,
} = require("../lib/comfyWorkflow");

const template = {
  1: { class_type: "LoadImage", inputs: { image: "{{IDENTITY_IMAGE}}" } },
  2: { class_type: "LoadImage", inputs: { image: "{{POSE_IMAGE}}" } },
  3: { class_type: "CLIPTextEncode", inputs: { text: "{{PROMPT}}", negative: "{{NEGATIVE_PROMPT}}" } },
  4: { class_type: "EmptyLatentImage", inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}", seed: "{{SEED}}" } },
};

test("ComfyUI endpoint is loopback-only by default", () => {
  assert.equal(normalizeComfyEndpoint("http://localhost:8188/"), "http://localhost:8188");
  assert.equal(normalizeComfyEndpoint("http://127.0.0.1:8188"), "http://127.0.0.1:8188");
  assert.throws(() => normalizeComfyEndpoint("http://192.168.1.20:8188"), /loopback/);
  assert.equal(normalizeComfyEndpoint("https://private.example.test/comfy", { allowRemote: true }), "https://private.example.test/comfy");
});

test("workflow validation requires prompt, pose, and identity inputs", () => {
  assert.deepEqual(validateWorkflowContract(template), template);
  assert.throws(() => validateWorkflowContract({ 1: { inputs: { text: "{{PROMPT}}" } } }), /POSE_IMAGE/);
});

test("workflow rendering preserves numeric control values", () => {
  const rendered = renderWorkflowTemplate(template, {
    IDENTITY_IMAGE: "identity.png",
    POSE_IMAGE: "pose.png",
    PROMPT: "portrait",
    NEGATIVE_PROMPT: "blur",
    WIDTH: 1024,
    HEIGHT: 1280,
    SEED: 42,
  }, ["IDENTITY_IMAGE", "POSE_IMAGE", "PROMPT"]);
  assert.equal(rendered[1].inputs.image, "identity.png");
  assert.equal(rendered[3].inputs.text, "portrait");
  assert.equal(rendered[4].inputs.width, 1024);
  assert.equal(rendered[4].inputs.seed, 42);
});

test("ComfyUI response helpers identify uploads and output images", () => {
  assert.equal(uploadedImageName({ name: "person.png", subfolder: "poseforge" }), "poseforge/person.png");
  assert.deepEqual(firstOutputImage({ abc: { outputs: { 9: { images: [{ filename: "result.png", type: "output" }] } } } }, "abc"), { filename: "result.png", type: "output" });
});
