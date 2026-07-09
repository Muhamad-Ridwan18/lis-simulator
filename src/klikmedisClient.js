export async function sendResultToKlikmedis(resultPayload) {
  const baseUrl = (process.env.KLIKMEDIS_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const apiKey = process.env.KLIKMEDIS_API_KEY ?? '';
  const url = `${baseUrl}/api/lis/receive-result`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(resultPayload),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = { raw: await response.text() };
  }

  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}
