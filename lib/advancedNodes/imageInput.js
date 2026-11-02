const { UUID_PATTERN, finiteNumber, inputName, shortText } = require("./shared");

/** An image: an upload, a web URL, a character's primary photo or a pose
 * library entry. The last three resolve to a stored file when a run starts
 * (lib/advancedRunInputs.js). */
module.exports = {
  type: "imageInput",
  inputs: [],
  outputs: ["image"],
  inputKind: "image",
  sanitize(value) {
    const data = {};
    const imageUrl = shortText(value.imageUrl, 2_048);
    if (imageUrl) data.imageUrl = imageUrl;
    const characterId = shortText(value.characterId, 64);
    if (characterId && UUID_PATTERN.test(characterId)) data.characterId = characterId;
    const poseId = shortText(value.poseId, 64);
    if (poseId && UUID_PATTERN.test(poseId)) data.poseId = poseId;
    const name = inputName(value.inputName);
    if (name) data.inputName = name;
    const fileName = shortText(value.fileName, 200);
    if (fileName) data.fileName = fileName;
    const naturalWidth = finiteNumber(value.naturalWidth, 0, 0, 16_384);
    const naturalHeight = finiteNumber(value.naturalHeight, 0, 0, 16_384);
    if (naturalWidth > 0) data.naturalWidth = naturalWidth;
    if (naturalHeight > 0) data.naturalHeight = naturalHeight;
    const imageFit = shortText(value.imageFit, 8);
    if (imageFit === "fit" || imageFit === "fill") data.imageFit = imageFit;
    return data;
  },
  items(node) {
    return node.data?.imageUrl ? [{ image: node.data.imageUrl }] : [];
  },
};
