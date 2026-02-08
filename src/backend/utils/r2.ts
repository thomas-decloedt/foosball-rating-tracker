import type { R2Bucket } from "@cloudflare/workers-types";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";

/**
 * Upload a base64 image to R2 and return the public URL
 * @param r2Bucket - R2 bucket instance
 * @param userId - User ID to use as filename prefix
 * @param base64Image - Base64 encoded image (data:image/...)
 * @returns Public URL to the uploaded image
 */
export async function uploadProfileImageToR2(
  r2Bucket: R2Bucket,
  userId: string,
  base64Image: string,
): Promise<string> {
  // Validate base64 image format
  if (!base64Image.startsWith("data:image/")) {
    throw new CustomError(
      "Invalid image format. Must be a base64 encoded image.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Extract image data and content type
  const matches = base64Image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new CustomError(
      "Invalid base64 image format.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const [, imageType, base64Data] = matches;
  if (!imageType || !base64Data) {
    throw new CustomError(
      "Invalid base64 image format.",
      ErrorCode.VALIDATION_ERROR,
    );
  }
  const contentType = `image/${imageType}`;

  // Convert base64 to binary
  const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Validate file size (max 500KB binary)
  if (binaryData.length > 500 * 1024) {
    throw new CustomError(
      "Profile image too large. Maximum size is 500KB.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Generate filename: {userId}.{ext}
  const extension = imageType === "jpeg" ? "jpg" : imageType;
  const key = `profile-images/${userId}.${extension}`;

  // Upload to R2
  await r2Bucket.put(key, binaryData, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
    customMetadata: {
      userId,
      uploadedAt: new Date().toISOString(),
    },
  });

  // Return public URL - served via Worker endpoint
  // The Worker serves images from R2 at /api/v1/profile-images/{userId}.{ext}
  return `/api/v1/profile-images/${userId}.${extension}`;
}

/**
 * Delete a profile image from R2
 * @param r2Bucket - R2 bucket instance
 * @param userId - User ID to identify the image
 */
export async function deleteProfileImageFromR2(
  r2Bucket: R2Bucket,
  userId: string,
): Promise<void> {
  // Try common image extensions (including webp for converted GIFs)
  const extensions = ["jpg", "jpeg", "png", "gif", "webp"];
  const keys = extensions.map((ext) => `profile-images/${userId}.${ext}`);

  // Delete all possible variations (in case extension changed or GIF was converted to WebP)
  await Promise.allSettled(keys.map((key) => r2Bucket.delete(key)));
}

/**
 * Get the public URL for a profile image
 * @param profileImage - Profile image R2 URL (stored in database)
 * @returns Public URL string or null
 */
export function getProfileImageUrl(profileImage: string | null): string | null {
  if (!profileImage) {
    return null;
  }

  // Explicitly reject base64 images (legacy format)
  // Base64 images start with "data:image/" and should not be returned
  if (profileImage.startsWith("data:image/")) {
    console.warn(
      `[getProfileImageUrl] Rejecting base64 image for user (legacy format)`,
    );
    return null;
  }

  // Profile images are stored as R2 URLs (e.g., /api/v1/profile-images/{userId}.{ext})
  // Return as-is if it's a valid URL path
  if (profileImage.startsWith("/") || profileImage.startsWith("http")) {
    return profileImage;
  }

  // Invalid format - return null
  console.warn(
    `[getProfileImageUrl] Invalid profile image format: ${profileImage.substring(0, 50)}...`,
  );
  return null;
}

/**
 * Upload a base64 file to R2 for season icons (supports any file type)
 * @param r2Bucket - R2 bucket instance
 * @param seasonId - Season ID to use as filename prefix
 * @param base64File - Base64 encoded file (data:image/..., data:video/..., etc.)
 * @returns Public URL to the uploaded file
 */
export async function uploadSeasonIconToR2(
  r2Bucket: R2Bucket,
  seasonId: string,
  base64File: string,
): Promise<string> {
  // Validate base64 file format
  if (!base64File.startsWith("data:")) {
    throw new CustomError(
      "Invalid file format. Must be a base64 encoded file.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Extract MIME type and file data
  const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new CustomError(
      "Invalid base64 file format.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  const [, mimeType, base64Data] = matches;
  if (!mimeType || !base64Data) {
    throw new CustomError(
      "Invalid base64 file format.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Convert base64 to binary
  const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Validate file size (max 2MB for flexibility with videos/gifs)
  if (binaryData.length > 2 * 1024 * 1024) {
    throw new CustomError(
      "Season icon too large. Maximum size is 2MB.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Determine file extension from MIME type
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };

  // Extract extension from MIME type or default to first part after /
  const mimeParts = mimeType.split("/");
  const extension =
    mimeToExt[mimeType] ||
    (mimeParts.length > 1 && mimeParts[1] ? mimeParts[1].split("+")[0] : "bin");

  // Generate filename: {seasonId}.{ext}
  const key = `season-icons/${seasonId}.${extension}`;

  // Upload to R2
  await r2Bucket.put(key, binaryData, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
    customMetadata: {
      seasonId,
      uploadedAt: new Date().toISOString(),
    },
  });

  // Return public URL - served via Worker endpoint
  return `/api/v1/season-icons/${seasonId}.${extension}`;
}

/**
 * Delete a season icon from R2
 * @param r2Bucket - R2 bucket instance
 * @param seasonId - Season ID to identify the icon
 */
export async function deleteSeasonIconFromR2(
  r2Bucket: R2Bucket,
  seasonId: string,
): Promise<void> {
  // Try common file extensions
  const extensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "mp4",
    "webm",
    "mov",
    "pdf",
  ];
  const keys = extensions.map((ext) => `season-icons/${seasonId}.${ext}`);

  // Delete all possible variations
  await Promise.allSettled(keys.map((key) => r2Bucket.delete(key)));
}
