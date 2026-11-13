/**
 * Encrypts Google refresh tokens before they go into the database
 * (AES-256-GCM, key derived from APP_SECRET), so a copy of copilot.db alone
 * does not give access to anyone's Gmail or Calendar.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function createTokenVault(secret) {
  if (!secret) throw new Error("The token vault needs a secret.");
  const key = crypto.createHash("sha256").update(secret).digest();

  return {
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64");
    },

    decrypt(stored) {
      const data = Buffer.from(stored, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

/** APP_SECRET, or the one saved in `secretPath`, made the first time it is needed. */
function loadAppSecret({ appSecret, secretPath }) {
  if (appSecret) return appSecret;
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf8").trim();

  const secret = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

module.exports = { createTokenVault, loadAppSecret };
