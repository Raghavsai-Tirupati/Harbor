import OpenAI from 'openai';
import { getEnv } from '../../../shared/config.js';
import { logger } from '../../../shared/utils/index.js';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const env = getEnv();
  if (!env.FEATHERLESS_API_KEY) throw new Error('FEATHERLESS_API_KEY not configured');
  _client = new OpenAI({
    apiKey: env.FEATHERLESS_API_KEY,
    baseURL: env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1',
  });
  return _client;
}

const DEFAULT_MODEL = 'Qwen/Qwen2.5-72B-Instruct';

export interface FeatherlessOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Basic completion via Featherless (OpenAI-compatible endpoint).
 */
export async function featherlessComplete(
  systemPrompt: string,
  userPrompt: string,
  opts: FeatherlessOptions = {},
): Promise<string> {
  const { model = DEFAULT_MODEL, maxTokens = 512, temperature = 0.3 } = opts;

  try {
    const resp = await getClient().chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return resp.choices[0]?.message?.content || '';
  } catch (err: any) {
    logger.error({ err: err.message }, 'Featherless completion failed');
    throw err;
  }
}

/**
 * Extract structured data from text using Featherless.
 * Returns parsed JSON or null on failure.
 */
export async function featherlessExtract<T = any>(
  schema: string,
  text: string,
  opts: FeatherlessOptions = {},
): Promise<T | null> {
  const systemPrompt = `You are a data extraction engine. Extract the requested information from the provided text and return ONLY valid JSON matching this schema. No explanations.\n\nSchema: ${schema}`;

  try {
    const result = await featherlessComplete(systemPrompt, text, {
      ...opts,
      temperature: 0.1,
    });

    // Try to parse JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const arrayMatch = result.match(/\[[\s\S]*\]/);
      if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;
      return null;
    }
    return JSON.parse(jsonMatch[0]) as T;
  } catch (err) {
    logger.warn({ err }, 'Featherless extraction failed');
    return null;
  }
}

/**
 * Summarize text to a short, safe snippet.
 */
export async function featherlessSummarize(
  text: string,
  maxWords = 30,
  opts: FeatherlessOptions = {},
): Promise<string> {
  const systemPrompt = `Summarize the following text in ${maxWords} words or less. Be factual and neutral. Do not add opinions. Output ONLY the summary text.`;

  try {
    return await featherlessComplete(systemPrompt, text, {
      ...opts,
      maxTokens: 100,
      temperature: 0.2,
    });
  } catch (err) {
    logger.warn({ err }, 'Featherless summarization failed');
    // Return truncated original as fallback
    return text.slice(0, 200) + (text.length > 200 ? '...' : '');
  }
}

/**
 * Extract user intent, location mentions, and hazard types from chat message.
 */
export interface ChatPreprocessResult {
  intent: string;
  locationMention: string | null;
  hazardTypes: string[];
  isEmergency: boolean;
}

export async function preprocessChatMessage(message: string): Promise<ChatPreprocessResult> {
  const schema = `{
    "intent": "string (brief description of what user wants)",
    "locationMention": "string|null (any place name or coordinates mentioned)",
    "hazardTypes": ["string"] (any hazard types: wildfire, earthquake, cyclone, flood, tornado),
    "isEmergency": "boolean (true if user seems to be in immediate danger)"
  }`;

  const result = await featherlessExtract<ChatPreprocessResult>(schema, message);

  return result || {
    intent: 'general inquiry',
    locationMention: null,
    hazardTypes: [],
    isEmergency: false,
  };
}

/**
 * Fallback chat completion when Gemini fails.
 */
export async function featherlessChatFallback(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  try {
    const resp = await getClient().chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    return resp.choices[0]?.message?.content || 'I apologize, but I am unable to provide a response at this time.';
  } catch (err: any) {
    logger.error({ err: err.message }, 'Featherless fallback also failed');
    return 'I apologize, but all AI services are currently unavailable. Please try again later.';
  }
}
