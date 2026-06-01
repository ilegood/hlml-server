import { v2 as cloudinary } from "cloudinary";
import { customCloudinaryStorage } from "./customCloudinaryStorage.js";
import multer from "multer";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

const storage = customCloudinaryStorage({
  folder: "hlml_uploads",
  allowed_formats: ["jpg", "png", "jpeg", "gif", "webp"],
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});
export { cloudinary };
