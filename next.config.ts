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

      config.externals.push(
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (request === "clude-bot/dist/core/memory-graph") {
            return callback(null, `commonjs ${path.join(coreDir, "memory-graph.js")}`);
          }
          if (request === "clude-bot/dist/core/database") {
            return callback(null, `commonjs ${path.join(coreDir, "database.js")}`);
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
