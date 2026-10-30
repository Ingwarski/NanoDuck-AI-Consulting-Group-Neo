const jpegEnd = Buffer.from([0xff, 0xd9]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngEnd = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const webpTypes = new Set(["VP8 ", "VP8L", "VP8X"]);

export const maxAttachmentsPerMessage = 4;

const matches = (content, signature, offset = 0) => content.byteLength >= signature.byteLength + offset && content.subarray(offset, offset + signature.byteLength).equals(signature);

export function inspectImageAttachment(content) {
  if (!Buffer.isBuffer(content) || content.byteLength < 4) return undefined;
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff && matches(content, jpegEnd, content.byteLength - jpegEnd.byteLength)) return "image/jpeg";
  if (matches(content, pngSignature) && matches(content, pngEnd, content.byteLength - pngEnd.byteLength)) return "image/png";
  if (matches(content, Buffer.from("RIFF")) && matches(content, Buffer.from("WEBP"), 8) && content.byteLength >= 20 && content.readUInt32LE(4) === content.byteLength - 8 && webpTypes.has(content.subarray(12, 16).toString("ascii"))) return "image/webp";
  return undefined;
}

export async function readImageAttachment(request, maximum) {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maximum) {
    request.resume();
    throw Object.assign(new Error("attachment_too_large"), { code: "attachment_too_large" });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > maximum) {
      request.resume();
      throw Object.assign(new Error("attachment_too_large"), { code: "attachment_too_large" });
    }
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  const contentType = inspectImageAttachment(content);
  if (!contentType) throw Object.assign(new Error("invalid_image_attachment"), { code: "invalid_image_attachment" });
  return Object.freeze({ content, contentType, byteLength: content.byteLength });
}

export const attachmentExtension = contentType => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType]);
