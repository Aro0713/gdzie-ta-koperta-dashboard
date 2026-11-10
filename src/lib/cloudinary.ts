import { v2 as cloudinary } from "cloudinary";

const rawCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim().replace(/^["']|["']$/g, "");
const rawApiKey = process.env.CLOUDINARY_API_KEY?.trim().replace(/^["']|["']$/g, "");
const rawApiSecret = process.env.CLOUDINARY_API_SECRET?.trim().replace(/^["']|["']$/g, "");

if (rawCloudName && rawApiKey && rawApiSecret) {
  cloudinary.config({
    cloud_name: rawCloudName,
    api_key: rawApiKey,
    api_secret: rawApiSecret,
    secure: true,
  });
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(rawCloudName && rawApiKey && rawApiSecret);
}

export function extractPublicIdFromUrl(input: string): string | null {
  if (!input) return null;
  // Jeśli przekazano bezpośrednio public_id (nie zawiera protokołu)
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    return input.replace(/\.[^/.]+$/, "");
  }

  try {
    const parsed = new URL(input);
    const pathname = parsed.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    let afterUpload = pathname.substring(uploadIndex + "/upload/".length);
    // Usuń opcjonalne transformacje (np. f_auto,q_auto) oraz wersję (np. v12345/)
    afterUpload = afterUpload.replace(
      /^(?:[a-zA-Z0-9_,]+(?:\/[a-zA-Z0-9_,]+)*\/)?(?:v\d+\/)?/,
      ""
    );
    return afterUpload.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

export async function uploadImageToCloudinary(
  fileBuffer: Buffer,
  fileName: string = "spot-photo"
): Promise<{ url: string; publicId: string }> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "gdzie-ta-koperta/spots",
        resource_type: "image",
        public_id: `${fileName.replace(/\.[^/.]+$/, "")}_${Date.now()}`,
        transformation: [
          { quality: "auto", fetch_format: "auto" }, // automatyczna optymalizacja do WebP/AVIF
        ],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Cloudinary upload failed with empty result."));
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
}

export async function deleteImageFromCloudinary(
  urlOrPublicId: string
): Promise<boolean> {
  if (!isCloudinaryConfigured()) {
    console.warn("Cloudinary is not configured. Skipping deletion for:", urlOrPublicId);
    return false;
  }

  const publicId = extractPublicIdFromUrl(urlOrPublicId);
  if (!publicId) {
    console.warn("Could not extract publicId from:", urlOrPublicId);
    return false;
  }

  try {
    const res = await cloudinary.uploader.destroy(publicId);
    return res.result === "ok" || res.result === "not found";
  } catch (err) {
    console.error("Cloudinary destroy error:", err);
    return false;
  }
}
