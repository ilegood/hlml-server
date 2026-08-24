import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

class CloudinaryStorage {
  constructor(options) {
    this.cloudinary = cloudinary;
    this.options = options;
    // Cloudinary configuration is already done globally in middleware/cloudinary.js
  }

  _handleFile(req, file, cb) {
    const stream = this.cloudinary.uploader.upload_stream(
      {
        folder: this.options.folder || "uploads",
        resource_type: "auto", // Automatically detect resource type (image, video, raw)
      },
      (error, result) => {
        if (error) {
          return cb(error);
        }
        cb(null, {
          public_id: result.public_id,
          version: result.version,
          signature: result.signature,
          resource_type: result.resource_type,
          format: result.format,
          url: result.secure_url,
        });
      }
    );

    // Pipe the file stream to cloudinary upload stream
    file.stream.pipe(stream);
  }

  _removeFile(req, file, cb) {
    // Implement file removal if needed. For now, we'll assume files are managed by public_id
    // and can be deleted directly via cloudinary.uploader.destroy if needed elsewhere.
    // For Multer's _removeFile, we'll just call the callback.
    cb(null);
  }
}

function customCloudinaryStorage(options) {
  return new CloudinaryStorage(options);
}

export { customCloudinaryStorage };
