/**
 * RFC 6238 TOTP, enough to drive the ping handshake without a dependency.
 * Secrets from pyotp are standard base32; the code is HMAC-SHA1 of an 8-byte
 * counter, then dynamic truncation to six digits.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function decodeBase32(input) {
  const cleaned = String(input).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const char of cleaned) {
    const idx = ALPHABET.indexOf(char)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export async function totpNow(secret) {
  const keyBytes = decodeBase32(secret)
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buffer = new ArrayBuffer(8)
  new DataView(buffer).setUint32(4, counter)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buffer))
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, '0')
}

export function msUntilNextTotpStep() {
  return 30_000 - (Date.now() % 30_000) + 800
}

export function waitForNextTotpStep() {
  return new Promise((resolve) => setTimeout(resolve, msUntilNextTotpStep()))
}
