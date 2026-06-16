async function computeHash(text) {
  const encoded = new TextEncoder().encode(text.trim());
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 10);
}
