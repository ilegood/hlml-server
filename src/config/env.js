import dotenv from "dotenv";

dotenv.config();

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseOrigins = (value) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const useDbSsl =
  process.env.NODE_ENV === "production" || process.env.DB_SSL === "true";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: required("PORT"),
  clientOrigins: parseOrigins(required("CLIENT_URL")),
  clientBaseUrl: parseOrigins(required("CLIENT_URL"))[0],
  jwtSecret: process.env.JWT_SECRET || required("SECRET_KEY"),
  db: {
    host: required("DB_HOST"),
    port: process.env.DB_PORT,
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_DATABASE"),
    ssl: useDbSsl ? { rejectUnauthorized: true } : false,
  },
  cloudinary: {
    cloudName: required("CLOUDINARY_CLOUD_NAME"),
    apiKey: required("CLOUDINARY_API_KEY"),
    apiSecret: required("CLOUDINARY_API_SECRET"),
  },
  mail: {
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === "true",
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
  },
};
