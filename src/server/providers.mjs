import { cachedAllowance } from "./account-usage.mjs";
import { createClaudeProvider } from "./claude-provider.mjs";
import { createCodexProvider } from "./codex-provider.mjs";

export function createProviders(config) {
  const codex = createCodexProvider(config); const claude = createClaudeProvider(config);
  const readCodexAllowance = cachedAllowance(() => codex.accountUsage());
  return Object.freeze({
    async accountUsage() {
      return { codex: await readCodexAllowance(), claude_code: { status: "external", checkedAt: null, windows: [], url: "https://claude.ai/settings/usage" } };
    },
    async releaseScope(scope) { await Promise.all([codex.releaseScope(scope), claude.releaseScope(scope)]); },
    async inspect() {
      const [codexCapability, claudeCapability] = await Promise.all([codex.inspect(), claude.inspect()]);
      return Object.freeze({ codex: codexCapability, claude_code: claudeCapability });
    },
    async invoke(input) {
      if (input.provider === "claude_code") return claude.invoke(input);
      if (input.provider === "codex" || input.provider === undefined) return codex.invoke(input);
      return { ok: false, code: "incompatible" };
    }
  });
}
