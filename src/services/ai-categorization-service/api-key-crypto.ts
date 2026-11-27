import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import type { AiCategorizationEnvironment } from "@/services/ai-categorization-service/factory";

const ENCRYPTION_KEY_ENV = "AI_CATEGORIZATION_ENCRYPTION_KEY";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = 1;

type EncryptedSecretEnvelope = {
  version: 1;
  iv: string;
  ciphertext: string;
  authTag: string;
};

// Kept from the zeMoney name: changing the AAD prefix would break decryption of stored AI API keys.
function encryptionAad(userId: string) {
  return Buffer.from(`zemoney:ai-categorization:${userId}`, "utf8");
}

export function decodeEncryptionKey(env: AiCategorizationEnvironment) {
  const encoded = env[ENCRYPTION_KEY_ENV]?.trim();
  if (!encoded) return null;
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  ) {
    return null;
  }
  try {
    const key = Buffer.from(encoded, "base64");
    return key.byteLength === 32 && key.toString("base64") === encoded
      ? key
      : null;
  } catch {
    return null;
  }
}

function requiredEncryptionKey(env: AiCategorizationEnvironment) {
  const key = decodeEncryptionKey(env);
  if (!key) {
    throw new AiCategorizationError(
      "AI_SETTINGS_ENCRYPTION_KEY_UNAVAILABLE",
      `Configure a valid ${ENCRYPTION_KEY_ENV} before saving API Key`,
      503,
    );
  }
  return key;
}

export function encryptApiKey(
  userId: string,
  apiKey: string,
  env: AiCategorizationEnvironment,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    requiredEncryptionKey(env),
    iv,
  );
  cipher.setAAD(encryptionAad(userId));
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const envelope: EncryptedSecretEnvelope = {
    version: ENCRYPTION_VERSION,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
  return JSON.stringify(envelope);
}

export function decryptApiKey(
  userId: string,
  serialized: string,
  env: AiCategorizationEnvironment,
) {
  try {
    const envelope = JSON.parse(serialized) as Partial<EncryptedSecretEnvelope>;
    if (
      envelope.version !== ENCRYPTION_VERSION ||
      typeof envelope.iv !== "string" ||
      typeof envelope.ciphertext !== "string" ||
      typeof envelope.authTag !== "string"
    ) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      requiredEncryptionKey(env),
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(encryptionAad(userId));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (
      error instanceof AiCategorizationError &&
      error.code === "AI_SETTINGS_ENCRYPTION_KEY_UNAVAILABLE"
    ) {
      throw error;
    }
    throw new AiCategorizationError(
      "AI_SETTINGS_SECRET_DECRYPTION_FAILED",
      "Saved AI API Key cannot be decrypted. Restore the encryption key or reconfigure",
      503,
    );
  }
}
