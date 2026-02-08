import { GoogleGenerativeAI } from '@google/generative-ai';
import { getEnv } from '../../../shared/config.js';
import { logger } from '../../../shared/utils/index.js';

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (_genAI) return _genAI;
  const key = getEnv().GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  _genAI = new GoogleGenerativeAI(key);
  return _genAI;
}

export interface GeminiCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Complete a prompt using Gemini.
 */
export async function geminiComplete(opts: GeminiCompletionOptions): Promise<string> {
  const { systemPrompt, userPrompt, maxTokens = 1024, temperature = 0.7 } = opts;

  try {
    const model = getGenAI().getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] }],
    });

    const text = result.response.text();
    return text;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Gemini completion failed');
    throw err;
  }
}

/**
 * Chat completion with history.
 */
export async function geminiChat(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens = 1024,
): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMsg.content);
    return result.response.text();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Gemini chat failed');
    throw err;
  }
}
