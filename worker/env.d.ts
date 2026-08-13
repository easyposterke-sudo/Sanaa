interface Env {
  /** Set with `wrangler secret put OPENAI_API_KEY`; never store a real key in source. */
  OPENAI_API_KEY?: string;
}
