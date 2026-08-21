interface Env {
  /** Set with `wrangler secret put OPENAI_API_KEY`; never store a real key in source. */
  OPENAI_API_KEY?: string;
  /** Optional Pexels API key used for user-approved stock photo replacements. */
  PEXELS_API_KEY?: string;
  /** Set with `wrangler secret put REMOVE_BG_API_KEY`; never expose it to the browser. */
  REMOVE_BG_API_KEY?: string;
}
