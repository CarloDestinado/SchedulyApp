import Constants from 'expo-constants';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function getConfigValue(key: string): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const manifestExtra = (Constants.manifest as any)?.extra as Record<string, unknown> | undefined;
  const fromEnv = typeof process?.env?.[key] === 'string' ? process.env[key] as string : undefined;
  const fromExtra = typeof expoExtra?.[key] === 'string' ? expoExtra[key] as string : undefined;
  const fromManifest = typeof manifestExtra?.[key] === 'string' ? manifestExtra[key] as string : undefined;
  return fromEnv ?? fromExtra ?? fromManifest;
}

export function getGroqApiKey(): string | undefined {
  return getConfigValue('GROQ_API_KEY');
}

export async function fetchGroqResponse(prompt: string, apiKeyOverride?: string): Promise<string> {
  const apiKey = apiKeyOverride || getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq API key is not configured.');
  }

  const endpoint = `${GROQ_API_BASE}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 256,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || response.statusText || 'Unknown Groq error';
    throw new Error(`Groq API request failed: ${message}`);
  }

  const prediction = json?.choices?.[0]?.message?.content;
  if (!prediction) {
    throw new Error('Groq API returned no prediction.');
  }

  return String(prediction);
}
