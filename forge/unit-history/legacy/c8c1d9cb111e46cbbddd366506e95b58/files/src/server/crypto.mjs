import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const encrypted = (value, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Object.freeze({ iv: iv.toString("base64url"), ciphertext, tag: cipher.getAuthTag().toString("base64url") });
}

const decrypted = (value, key) => {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.isBuffer(value.ciphertext) ? value.ciphertext : Buffer.from(value.ciphertext, "base64url")), decipher.final()]);
}

export function encryptText(value, key) {
  const valueEncrypted = encrypted(Buffer.from(value, "utf8"), key);
  return Object.freeze({ ...valueEncrypted, ciphertext: valueEncrypted.ciphertext.toString("base64url") });
}

export function decryptText(value, key) { return decrypted(value, key).toString("utf8"); }

export function encryptBytes(value, key) { return encrypted(Buffer.from(value), key); }

export function decryptBytes(value, key) { return decrypted(value, key); }

export function sign(value, key) {
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function secureEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export const randomId = () => randomBytes(24).toString("base64url");
