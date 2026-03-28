/**
 * Generates backend/docs/openapi.json and backend/docs/openapi.yaml
 * from the live Fastify route schemas.
 *
 * Usage: npx tsx scripts/generate-openapi.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { buildServer } = await import("../src/index.js");

  const server = await buildServer();
  await server.ready();

  const spec = server.swagger();

  const docsDir = join(__dirname, "..", "docs");
  mkdirSync(docsDir, { recursive: true });

  const jsonPath = join(docsDir, "openapi.json");
  writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
  console.log(`✓ Wrote ${jsonPath}`);

  // Write YAML — convert via simple serialization
  const { default: yaml } = await import("js-yaml").catch(() => {
    console.warn("js-yaml not installed, skipping .yaml output");
    return { default: null };
  });

  if (yaml) {
    const yamlPath = join(docsDir, "openapi.yaml");
    writeFileSync(yamlPath, yaml.dump(spec, { lineWidth: 120 }));
    console.log(`✓ Wrote ${yamlPath}`);
  }

  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
