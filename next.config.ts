import type { NextConfig } from "next";
import path from "path";

// Resolve the absolute path to clude-bot internals without going through exports map
const cludeBotRoot = path.dirname(
  require.resolve("clude-bot") // resolves to dist/sdk/index.js via "main" field
);
const coreDir = path.resolve(cludeBotRoot, "..", "core");

const nextConfig: NextConfig = {
  serverExternalPackages: ["clude-bot"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // clude-bot's package.json exports don't expose internal subpaths.
      // Use externals with absolute paths so Node resolves the files directly,
      // bypassing the exports map.
      config.externals = config.externals || [];
      const featuresDir = path.resolve(cludeBotRoot, "..", "features");

      const sdkDir = path.resolve(cludeBotRoot, "..", "sdk");
      const utilsDir = path.resolve(cludeBotRoot, "..", "utils");

      config.externals.push(
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (request === "clude-bot/dist/core/memory-graph") {
            return callback(null, `commonjs ${path.join(coreDir, "memory-graph.js")}`);
          }
          if (request === "clude-bot/dist/core/database") {
            return callback(null, `commonjs ${path.join(coreDir, "database.js")}`);
          }
          if (request === "clude-bot/dist/core/inference") {
            return callback(null, `commonjs ${path.join(coreDir, "inference.js")}`);
          }
          if (request === "clude-bot/dist/core/guardrails") {
            return callback(null, `commonjs ${path.join(coreDir, "guardrails.js")}`);
          }
          if (request === "clude-bot/dist/core/input-guardrails") {
            return callback(null, `commonjs ${path.join(coreDir, "input-guardrails.js")}`);
          }
          if (request === "clude-bot/dist/core/venice-client") {
            return callback(null, `commonjs ${path.join(coreDir, "venice-client.js")}`);
          }
          if (request === "clude-bot/dist/core/embeddings") {
            return callback(null, `commonjs ${path.join(coreDir, "embeddings.js")}`);
          }
          if (request === "clude-bot/dist/core/encryption") {
            return callback(null, `commonjs ${path.join(coreDir, "encryption.js")}`);
          }
          if (request === "clude-bot/dist/sdk/cortex-v2") {
            return callback(null, `commonjs ${path.join(sdkDir, "cortex-v2.js")}`);
          }
          if (request === "clude-bot/dist/utils/constants") {
            return callback(null, `commonjs ${path.join(utilsDir, "constants.js")}`);
          }
          if (request?.startsWith("clude-bot/dist/features/")) {
            const featureName = request.replace("clude-bot/dist/features/", "");
            return callback(null, `commonjs ${path.join(featuresDir, featureName + ".js")}`);
          }
          callback();
        },
      );
    }
    return config;
  },
};

export default nextConfig;
