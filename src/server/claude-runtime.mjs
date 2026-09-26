import { join } from "node:path";

// Keep native subscription credentials in the CLI-owned location while
// suppressing user/project customizations. Administrator policy still applies.
export const claudeSafetyArgs = Object.freeze([
  "--safe-mode", "--restricted", "--settings", JSON.stringify({ disableAllHooks: true, forceLoginMethod: "claudeai" })
]);

export function claudeEnvironment(config, directory, { nativeLogin = false } = {}) {
  const token = nativeLogin ? undefined : config.claudeOAuthToken;
  const home = token ? directory : config.claudeHome;
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: home, USERPROFILE: home, TMPDIR: directory, TEMP: directory, TMP: directory,
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, LOCALAPPDATA: join(home, "AppData", "Local"), APPDATA: join(home, "AppData", "Roaming") } : {}),
    ...(token ? { CLAUDE_CONFIG_DIR: join(directory, "config"), CLAUDE_CODE_OAUTH_TOKEN: token }
      : config.claudeConfigDirectory ? { CLAUDE_CONFIG_DIR: config.claudeConfigDirectory } : {}),
    // Host-managed mode deliberately ignores native OAuth storage. It applies
    // only when the host supplies an explicit token, never to normal sign-in.
    ...(token ? { CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1" } : {}),
    CLAUDE_CODE_DISABLE_FAST_MODE: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_DISABLE_ATTACHMENTS: "1", CLAUDE_CODE_DISABLE_CRON: "1", CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: "1", CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", NO_COLOR: "1"
  };
}
