import { MAX_SHEET_BYTES } from '../../../src/upload-sheet';

/** Bound multipart input before formData allocates it; reject cross-origin mutations. */
export async function uploadForm(request: Request): Promise<FormData> {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new Response('Invalid request origin', { status: 403 });
  const limit = MAX_SHEET_BYTES + 65536;
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) throw new Response('File too large', { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Response('File too large', { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' } }).formData();
}
