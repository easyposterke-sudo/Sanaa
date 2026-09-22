interface Env {
  /** Set with `wrangler secret put OPENAI_API_KEY`; never store a real key in source. */
  OPENAI_API_KEY?: string;
  /** Set with `wrangler secret put REMOVE_BG_API_KEY`; never expose it to the browser. */
  REMOVE_BG_API_KEY?: string;
  /** Cloudflare Access team URL, for example https://my-team.cloudflareaccess.com. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Audience tag of the Access application protecting /admin. */
  ACCESS_ADMIN_AUD?: string;
}

declare namespace Cloudflare {
  interface Env {
    /** Set with `wrangler secret put OPENAI_API_KEY`; never store a real key in source. */
    OPENAI_API_KEY?: string;
    /** Set with `wrangler secret put REMOVE_BG_API_KEY`; never expose it to the browser. */
    REMOVE_BG_API_KEY?: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_ADMIN_AUD?: string;
  }
}
