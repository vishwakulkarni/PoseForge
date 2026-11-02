const { inputName, shortText } = require("./shared");

/** Video Input and Audio Input: one clip, stored as uploaded or downloaded
 * from a web URL when the run starts. */
function mediaInput(type, dataType) {
  return {
    type,
    inputs: [],
    outputs: [dataType],
    inputKind: dataType,
    sanitize(value) {
      const data = {};
      const mediaUrl = shortText(value.mediaUrl, 2_048);
      if (mediaUrl) data.mediaUrl = mediaUrl;
      const fileName = shortText(value.fileName, 200);
      if (fileName) data.fileName = fileName;
      const name = inputName(value.inputName);
      if (name) data.inputName = name;
      return data;
    },
    items(node) {
      return node.data?.mediaUrl ? [{ [dataType]: node.data.mediaUrl }] : [];
    },
  };
}

module.exports = {
  videoInput: mediaInput("videoInput", "video"),
  audioInput: mediaInput("audioInput", "audio"),
};
