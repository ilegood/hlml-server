import multer from "multer";
import { cloudinary } from "../middleware/cloudinary.js";

const countHangul = (value) =>
  (String(value).match(/[\uAC00-\uD7A3]/g) || []).length;

const normalizeOriginalName = (name) => {
  const value = String(name || "file");
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return countHangul(decoded) > countHangul(value) ? decoded : value;
};

export const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const getCloudinaryResourceType = (file) => {
  const mimeType = file.mimetype || "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "raw";
};

export const uploadChatFileToCloudinary = (file) => {
  const originalName = normalizeOriginalName(file.originalname);
  const resourceType = getCloudinaryResourceType(file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hlml_uploads/chat",
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ ...result, originalName });
      },
    );

    stream.end(file.buffer);
  });
};

export const getCloudinaryDownloadUrl = ({ publicId, resourceType, filename }) => {
  const safeFilename = String(filename || "download").replace(/[\/\\]/g, "_");

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType || "auto",
    flags: `attachment:${safeFilename}`,
  });
};

export const getDownloadProxyUrl = ({ url, filename }) =>
  `/chat/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(
    filename || "download",
  )}`;
