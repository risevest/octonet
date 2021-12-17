import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * Sign and encrypt data as a JWT token
 * @param secret secret for signing and encrypting
 * @param timeout how long before the JWT expires. This is intentionally required
 * @param data data to encoode and encrypt
 * @returns encrypted JWT token
 */
export function encode(secret: Uint8Array, timeout: string, data: any) {
  return new EncryptJWT({ "urn:custom:claim": data })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(timeout)
    .encrypt(secret);
}

/**
 * Decrypts and decodes tokens signed using `encode`.
 * @param secret secret used to `encode`
 * @param token token to be verified
 * @returns the claims
 */
export async function decode<T = any>(secret: Uint8Array, token: string) {
  const { payload } = await jwtDecrypt(token, secret);
  return payload["urn:custom:claim"] as T;
}
