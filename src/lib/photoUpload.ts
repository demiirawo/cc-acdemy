/**
 * iPhones save photos as HEIC by default, and no browser can display HEIC —
 * which used to mean staff photos silently rendered as blank avatars, and
 * since the upload validator started rejecting them, meant iPhone users
 * couldn't change their photo at all without converting it by hand. Convert
 * in the browser instead: the person picks their photo and it just works.
 *
 * The converter is a WASM build of libheif, so it's loaded on demand — only
 * someone actually uploading a HEIC pays for it.
 */
export const isHeic = (file: File): boolean =>
  /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

export async function normalizePhotoFile(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const name = file.name.replace(/\.hei[cf]$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
