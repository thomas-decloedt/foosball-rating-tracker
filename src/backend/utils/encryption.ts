// Web Crypto API (Workers-compatible)

export async function encryptString(
  key: string,
  text: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key.slice(0, 32).padEnd(32, "0"));

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(text),
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Base64 encode
  return btoa(String.fromCharCode(...combined));
}

export async function decryptString(
  key: string,
  encryptedData: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyData = encoder.encode(key.slice(0, 32).padEnd(32, "0"));

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

  // Split IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encrypted,
  );

  return decoder.decode(decrypted);
}
