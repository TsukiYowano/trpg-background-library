import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const uploadUrlExpiresIn = 5 * 60;
const downloadUrlExpiresIn = 60 * 60;

const contentTypeExtensions: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

type UploadTicket = {
  objectKey: string;
  userId: string;
  fileName: string;
  contentType: string;
  expiresAt: number;
};

let r2Client: S3Client | undefined;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getR2Client() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return r2Client;
}

function getBucketName() {
  return requireEnv("R2_BUCKET_NAME");
}

function signTicketPayload(payload: string) {
  return createHmac("sha256", requireEnv("UPLOAD_TICKET_SECRET"))
    .update(payload)
    .digest("base64url");
}

function createUploadTicket(ticket: UploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signTicketPayload(payload)}`;
}

export function validateImageFile(fileName: string, contentType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const allowedExtensions = contentTypeExtensions[contentType];

  if (!extension || !allowedExtensions?.includes(extension)) return null;
  return contentType === "image/jpeg" ? "jpg" : extension;
}

export async function createPresignedUpload(
  userId: string,
  fileName: string,
  contentType: string
) {
  const extension = validateImageFile(fileName, contentType);
  if (!extension) throw new Error("Unsupported image type");

  const objectKey = `${userId}/${crypto.randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: uploadUrlExpiresIn }
  );

  const ticket = createUploadTicket({
    objectKey,
    userId,
    fileName,
    contentType,
    expiresAt: Date.now() + uploadUrlExpiresIn * 1000,
  });

  return { uploadUrl, objectKey, ticket };
}

export function verifyUploadTicket(value: string, userId: string) {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(signTicketPayload(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const ticket = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as UploadTicket;

    if (
      ticket.userId !== userId ||
      ticket.expiresAt < Date.now() ||
      !ticket.objectKey.startsWith(`${userId}/`) ||
      !validateImageFile(ticket.fileName, ticket.contentType)
    ) {
      return null;
    }

    return ticket;
  } catch {
    return null;
  }
}

export async function getR2ObjectMetadata(objectKey: string) {
  return getR2Client().send(
    new HeadObjectCommand({ Bucket: getBucketName(), Key: objectKey })
  );
}

export async function deleteR2Object(objectKey: string) {
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: getBucketName(), Key: objectKey })
  );
}

export async function createPresignedDownloadUrl(objectKey: string) {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: getBucketName(), Key: objectKey }),
    { expiresIn: downloadUrlExpiresIn }
  );
}
