import Constants from 'expo-constants';

const GROK_API_BASE = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4.3';

function getConfigValue(key: string): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const manifestExtra = (Constants.manifest as any)?.extra as Record<string, unknown> | undefined;
  const fromEnv = typeof process?.env?.[key] === 'string' ? process.env[key] as string : undefined;
  const fromExtra = typeof expoExtra?.[key] === 'string' ? expoExtra[key] as string : undefined;
  const fromManifest = typeof manifestExtra?.[key] === 'string' ? manifestExtra[key] as string : undefined;
  return fromEnv ?? fromExtra ?? fromManifest;
}

export function getGrokApiKey(): string | undefined {
  return getConfigValue('GROK_API_KEY');
}

export async function fetchGrokResponse(prompt: string, apiKeyOverride?: string): Promise<string> {
  const apiKey = apiKeyOverride || getGrokApiKey();
  if (!apiKey) {
    throw new Error('Grok API key is not configured.');
  }

  const endpoint = `${GROK_API_BASE}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 256,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || response.statusText || 'Unknown Grok error';
    throw new Error(`Grok API request failed: ${message}`);
  }

  const prediction = json?.choices?.[0]?.message?.content;
  if (!prediction) {
    throw new Error('Grok API returned no prediction.');
  }

  return String(prediction);
}
