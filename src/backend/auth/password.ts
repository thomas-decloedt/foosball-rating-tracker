// Use @noble/hashes for scrypt (Workers-compatible, secure password hashing)
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { scrypt } from "@noble/hashes/scrypt.js";

// Scrypt parameters (matching bcrypt-like security)
const N = 16384; // CPU/memory cost (2^14)
const r = 8; // Block size
const p = 1; // Parallelization
const dkLen = 32; // Derived key length

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scrypt(password, salt, { N, r, p, dkLen });

  // Format: salt:hash (both hex-encoded)
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(":");
    if (!saltHex || !hashHex) return false;

    const salt = hexToBytes(saltHex);
    const expectedHash = hexToBytes(hashHex);

    const hash = scrypt(password, salt, { N, r, p, dkLen });

    // Constant-time comparison
    if (hash.length !== expectedHash.length) return false;
    let result = 0;
    for (let i = 0; i < hash.length; i++) {
      result |= hash[i]! ^ expectedHash[i]!;
    }

    return result === 0;
  } catch {
    return false;
  }
}
