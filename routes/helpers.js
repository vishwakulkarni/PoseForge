const fs = require("fs");
function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
function cleanup(file) { return file?.path ? fs.promises.rm(file.path, { force: true }).catch(() => {}) : Promise.resolve(); }
function errorStatus(err) { return err.code === "23505" ? 409 : err.statusCode || 500; }
module.exports = { asyncHandler, isUuid, cleanup, errorStatus };
