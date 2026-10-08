import { OpenAiPlannerError } from './openAiPosterPlanner';

/** Count the same images, messages and structured-output schema used to generate. */
export async function countInputTokens(apiKey: string, payload: Record<string, unknown>): Promise<number> {
  try {
    const response = await fetch('https://api.openai.com/v1/responses/input_tokens', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: payload.model, input: payload.input, text: payload.text, reasoning: payload.reasoning }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Input count unavailable');
    }
    const data = await response.json() as { input_tokens?: number };
    if (!Number.isSafeInteger(data.input_tokens) || data.input_tokens! < 0) throw new Error('Invalid input count');
    return data.input_tokens!;
  } catch {
    throw new OpenAiPlannerError('Could not estimate the AI cost. No generation was started. Please try again.', 503, 'AI_ESTIMATE_UNAVAILABLE');
  }
}
