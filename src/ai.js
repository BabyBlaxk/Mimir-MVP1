import { getSetting } from "./db.js";

const PROVIDERS = {
  openai: { base: "https://api.openai.com/v1", env: "OPENAI_API_KEY", model: "gpt-4o-mini" },
  grok: { base: "https://api.x.ai/v1", env: "XAI_API_KEY", model: "grok-3-mini" },
  anthropic: { base: "https://api.anthropic.com/v1", env: "ANTHROPIC_API_KEY", model: "claude-3-5-haiku-latest" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", env: "GEMINI_API_KEY", model: "gemini-2.0-flash" },
  openrouter: { base: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", model: "openai/gpt-4o-mini" },
  local: { base: process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434/v1", env: "", model: process.env.LOCAL_AI_MODEL || "llama3.2" },
  none: { base: "", env: "", model: "" },
};

export function providerStatus() {
  const selected = (getSetting("ai_provider") || process.env.AI_PROVIDER || "none").toLowerCase();
  const spec = PROVIDERS[selected] || PROVIDERS.none;
  const key = process.env.AI_API_KEY || (spec.env ? process.env[spec.env] : "");
  return {
    provider: selected,
    model: getSetting("ai_model") || process.env.AI_MODEL || spec.model,
    configured: selected === "none" ? false : Boolean(key || selected === "local"),
    available: Object.keys(PROVIDERS),
  };
}

function fallbackReply(messages, domain) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const text = last?.content || "";
  return [
    `I am Mimir in ${domain || "The Well"}. No remote model key is configured, so I am running the local fallback intelligence.`,
    text
      ? `I received: "${text.slice(0, 280)}". I can store memory, manage Forge projects, queue Domain approvals, and keep an audit trail. Set AI_PROVIDER and AI_API_KEY in the server environment to attach a live model.`
      : "Ask me about a project, a memory, or a system change. Sensitive actions stay at L2-L4.",
  ].join("\n\n");
}

export async function chatCompletion({ messages, domain }) {
  const status = providerStatus();
  const system = getSetting("system_prompt");
  const framed = [
    { role: "system", content: `${system}\nActive domain: ${domain || "well"}.` },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (!status.configured || status.provider === "none") {
    return { content: fallbackReply(messages, domain), provider: "local-fallback", model: "mimir-fallback" };
  }
  const spec = PROVIDERS[status.provider] || PROVIDERS.openai;
  const base = process.env.AI_BASE_URL || spec.base;
  const key = process.env.AI_API_KEY || (spec.env ? process.env[spec.env] : "");
  const model = status.model || spec.model;
  try {
    if (status.provider === "anthropic") {
      const userMsgs = framed.filter((m) => m.role !== "system");
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 800, system, messages: userMsgs }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const data = await res.json();
      return { content: data.content?.map((c) => c.text).join("\n") || "", provider: status.provider, model };
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: framed, temperature: 0.4 }),
    });
    if (!res.ok) throw new Error(`${status.provider} ${res.status}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || "", provider: status.provider, model };
  } catch (err) {
    return { content: `${fallbackReply(messages, domain)}\n\nRemote provider error: ${err.message}`, provider: "local-fallback", model: "mimir-fallback" };
  }
}
