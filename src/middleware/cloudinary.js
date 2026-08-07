import { v2 as cloudinary } from "cloudinary";
<<<<<<< HEAD
import { customCloudinaryStorage } from "./customCloudinaryStorage.js";
=======
>>>>>>> bird
import multer from "multer";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

<<<<<<< HEAD
const storage = customCloudinaryStorage({
  folder: "hlml_uploads",
  allowed_formats: ["jpg", "png", "jpeg", "gif", "webp"],
});
=======
const storage = {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "hlml_uploads",
        resource_type: "image",
        allowed_formats: ["jpg", "png", "jpeg", "gif", "webp"],
      },
      (error, result) => {
        if (error) {
          cb(error);
          return;
        }

        cb(null, {
          path: result.secure_url,
          filename: result.public_id,
          public_id: result.public_id,
          size: result.bytes,
        });
      },
    );

    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, cb) {
    if (!file.public_id) {
      cb(null);
      return;
    }

    cloudinary.uploader.destroy(file.public_id, cb);
  },
};
>>>>>>> bird

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
