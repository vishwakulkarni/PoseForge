const { finiteNumber, idList, shortText } = require("./shared");

/** A frame around other nodes (a storyboard scene). Carries no data. */
module.exports = {
  type: "group",
  inputs: [],
  outputs: [],
  sanitize(value, { maxNodes }) {
    const data = { memberIds: idList(value.memberIds, maxNodes) };
    const color = shortText(value.color, 16);
    if (/^[a-z]+$/.test(color)) data.color = color;
    const scene = finiteNumber(value.scene, 0, 0, 999);
    if (scene > 0) data.scene = scene;
    return data;
  },
  items() {
    return [];
  },
};
