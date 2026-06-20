import Constants from 'expo-constants';

const GEMINI_MODEL = 'gemini-1.5-pro';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getConfigValue(key: string): string | undefined {
  const expoExtra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const manifestExtra = (Constants.manifest as any)?.extra as Record<string, unknown> | undefined;
  const fromEnv = typeof process?.env?.[key] === 'string' ? process.env[key] as string : undefined;
  const fromExtra = typeof expoExtra?.[key] === 'string' ? expoExtra[key] as string : undefined;
  const fromManifest = typeof manifestExtra?.[key] === 'string' ? manifestExtra[key] as string : undefined;
  return fromEnv ?? fromExtra ?? fromManifest;
}

export function getGeminiApiKey(): string | undefined {
  return getConfigValue('GEMINI_API_KEY');
}

export async function fetchGeminiResponse(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in expo extra or environment.');
  }

  const endpoint = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json?.error?.message || response.statusText || 'Unknown Gemini error';
    throw new Error(`Gemini API request failed: ${message}`);
  }

  const prediction = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!prediction) {
    throw new Error('Gemini API returned no prediction.');
  }

  return String(prediction);
}
