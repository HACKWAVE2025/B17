const crypto = require('crypto');

const algorithm = 'aes-256-cbc'; // Encryption algorithm

// Resolve encryption key from environment with safe fallbacks for dev
function resolveSecretKey() {
  const envKey = process.env.ENCRYPTION_SECRET_KEY;

  // Helper: derive a 32-byte key using SHA-256 of the input
  const derive32 = (input) => crypto.createHash('sha256').update(String(input)).digest();

  let keyBuf;
  if (!envKey) {
    // Dev-friendly fallback to avoid cryptic Buffer.from(undefined) crash
    // NOTE: This key is NOT secure and is only for local development.
    console.warn('[encryptionMiddleware] ENCRYPTION_SECRET_KEY not set. Using a non-persistent development key. Set ENCRYPTION_SECRET_KEY for production.');
    keyBuf = derive32('dev-fallback-key');
  } else if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    // 64 hex chars -> 32 bytes
    keyBuf = Buffer.from(envKey, 'hex');
  } else {
    // Try base64 first; if that fails or not 32 bytes, fall back to utf8 and/or derive
    try {
      const b64 = Buffer.from(envKey, 'base64');
      if (b64.length === 32) {
        keyBuf = b64;
      } else {
        // utf8 direct; if not 32 bytes, derive a 32-byte key via SHA-256
        const utf = Buffer.from(envKey, 'utf8');
        keyBuf = utf.length === 32 ? utf : derive32(envKey);
      }
    } catch (_) {
      const utf = Buffer.from(envKey, 'utf8');
      keyBuf = utf.length === 32 ? utf : derive32(envKey);
    }
  }

  if (keyBuf.length !== 32) {
    // As a final guard, ensure 32 bytes
    keyBuf = derive32(keyBuf);
  }

  return keyBuf;
}

const secretKey = resolveSecretKey();


// Encrypt payment method details
const encryptField = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const input = text == null ? '' : String(text);
    let encrypted = cipher.update(input, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encryptedData: encrypted };
  };
  
  // Function to decrypt data
const decryptField = (encryptedData, iv) => {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

module.exports = { encryptField, decryptField};
