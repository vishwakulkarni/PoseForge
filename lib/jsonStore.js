/**
 * Tiny JSON-file-backed store.
 *
 * Not a real database — this app has no DB. Each store wraps a single JSON
 * file holding one array/object. Writes are serialized through an internal
 * promise chain (this app is single-process, so that's enough to avoid
 * interleaved read-modify-write) and written atomically (tmp file + rename)
 * so a crash mid-write can't corrupt the file. Reads never throw: a missing
 * or corrupt file just falls back to `defaultValue`.
 */

const fs = require("fs");
const path = require("path");

class JsonStore {
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this._chain = Promise.resolve();
  }

  async _readRaw() {
    try {
      const text = await fs.promises.readFile(this.filePath, "utf8");
      return JSON.parse(text);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`[jsonStore] Failed to read/parse ${this.filePath}, falling back to default:`, err.message);
      }
      return JSON.parse(JSON.stringify(this.defaultValue));
    }
  }

  /** Read the current value (no locking needed for reads). */
  async read() {
    return this._readRaw();
  }

  async _writeRaw(value) {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(value, null, 2));
    await fs.promises.rename(tmpPath, this.filePath);
  }

  /**
   * Read-modify-write. `fn(current)` returns the new value (or a promise of
   * it). Queued behind any in-flight update on this store so concurrent
   * callers never clobber each other.
   */
  update(fn) {
    const run = async () => {
      const current = await this._readRaw();
      const next = await fn(current);
      await this._writeRaw(next);
      return next;
    };
    // Chain off the previous update regardless of whether it succeeded or
    // failed (`run` as both onFulfilled and onRejected) — otherwise one
    // rejected update would permanently wedge the queue for every future
    // caller on this store.
    const next = this._chain.then(run, run);
    this._chain = next.catch((err) => {
      console.error(`[jsonStore] update failed for ${this.filePath}:`, err.message);
    });
    return next;
  }
}

module.exports = { JsonStore };
