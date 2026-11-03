const form = document.querySelector('#unlock-form');
const input = document.querySelector('#password');
const button = document.querySelector('#unlock-button');
const status = document.querySelector('#status');
const decoder = new TextDecoder();
const encoder = new TextEncoder();
let encryptedPayload = null;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function unlock(password) {
  if (!encryptedPayload) {
    const response = await fetch('site.enc', { cache: 'no-store' });
    if (!response.ok) throw new Error('Die Vorschau ist gerade nicht erreichbar.');
    encryptedPayload = new Uint8Array(await response.arrayBuffer());
  }
  if (decoder.decode(encryptedPayload.slice(0, 5)) !== 'OELB1') {
    throw new Error('Das Datenpaket ist beschädigt.');
  }
  const salt = encryptedPayload.slice(5, 21);
  const iv = encryptedPayload.slice(21, 33);
  const ciphertext = encryptedPayload.slice(33);
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 1_000_000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  let compressed;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode('oelbibel-preview-v1') }, key, ciphertext,
    );
  } catch {
    throw new Error('Das Passwort ist nicht richtig.');
  }
  if (!('DecompressionStream' in window)) {
    throw new Error('Dieser Browser kann die Vorschau nicht öffnen. Bitte verwende eine aktuelle Browserversion.');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const payload = JSON.parse(await new Response(stream).text());
  const urls = {};
  for (const [path, asset] of Object.entries(payload.assets)) {
    urls[path] = URL.createObjectURL(new Blob([decodeBase64(asset.base64)], { type: asset.mime }));
  }
  const imageMap = Object.fromEntries(Object.entries(payload.images).map(([id, image]) => [
    id, { ...image, path: urls[image.path] },
  ]));
  window.__OEL_DATA__ = {
    catalog: payload.catalog,
    themes: payload.themes,
    images: imageMap,
    shop: payload.shop,
    placeholder: urls['produktbild-platzhalter.svg'],
    publicPreview: true,
  };
  const page = new DOMParser().parseFromString(payload.html, 'text/html');
  page.querySelector('script[src="catalog.js"]')?.remove();
  page.querySelector('.hero-product').src = urls['produktbilder/0e04ce56271adf00.png'];
  document.head.replaceChildren(...[...page.head.childNodes].map(node => document.importNode(node, true)));
  document.body.replaceChildren(...[...page.body.childNodes].map(node => document.importNode(node, true)));
  await import('./catalog.js');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Vorschau wird geöffnet …';
  try {
    await unlock(input.value);
    input.value = '';
  } catch (error) {
    status.textContent = error.message || 'Die Vorschau konnte nicht geöffnet werden.';
    input.value = '';
    input.focus();
    button.disabled = false;
  }
});
