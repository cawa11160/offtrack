const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isControlChar(ch: string) {
  const code = ch.charCodeAt(0);
  return code < 32 || code === 127;
}

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function sanitizeDisplayName(value: string) {
  return [...value].filter((ch) => !isControlChar(ch)).join("").replace(/\s+/g, " ").trim();
}

export function hasUnsupportedControlChars(value: string) {
  return [...value].some(isControlChar);
}

export function validateAuthEmail(value: string) {
  const email = normalizeAuthEmail(value);
  if (!email || email.length > 254 || hasUnsupportedControlChars(email) || !EMAIL_RE.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validateLoginPassword(value: string) {
  if (!value) return "Enter your password.";
  if (value.length > 128) return "Password must be 128 characters or fewer.";
  if (hasUnsupportedControlChars(value)) return "Password contains unsupported characters.";
  return null;
}

export function validateSignupPassword(value: string) {
  const basicError = validateLoginPassword(value);
  if (basicError) return basicError;
  if (value.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter.";
  if (!/\d/.test(value)) return "Password must include at least one number.";
  return null;
}

export function passwordStrength(value: string) {
  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 5);
}
