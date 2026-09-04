/** Shared error shape for OpenAI-backed poster planning operations. */
export class OpenAiPlannerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'OpenAiPlannerError';
  }
}
