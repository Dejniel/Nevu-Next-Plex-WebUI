import fs from "fs";
import path from "path";

const SOURCE_ROOT = __dirname;
const HEADLESS_FEATURE_ENTRYPOINTS = new Set(["watch-together"]);
const SOURCE_EXTENSION = /\.(ts|tsx)$/;
const IMPORT = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return SOURCE_EXTENSION.test(entry.name) ? [entryPath] : [];
  });
}

function sourcePath(file: string) {
  return path.relative(SOURCE_ROOT, file).replaceAll(path.sep, "/");
}

function targetPath(file: string, specifier: string) {
  if (specifier.startsWith("features/") || specifier.startsWith("entities/"))
    return specifier;
  if (!specifier.startsWith(".")) return null;
  return sourcePath(path.resolve(path.dirname(file), specifier));
}

function moduleOwner(relativePath: string) {
  const match = relativePath.match(/^(features|entities)\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { layer: match[1], name: match[2], entrypoint: match[3] || "" };
}

describe("frontend module boundaries", () => {
  it("uses public entrypoints for imports across feature and entity modules", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = sourcePath(file);
      const owner = moduleOwner(source);
      const contents = fs.readFileSync(file, "utf8");

      for (const match of contents.matchAll(IMPORT)) {
        const target = targetPath(file, match[1]);
        if (!target) continue;
        const targetOwner = moduleOwner(target);
        if (!targetOwner) continue;
        if (
          owner?.layer === targetOwner.layer &&
          owner.name === targetOwner.name
        )
          continue;

        const isPublic = targetOwner.entrypoint === "public";
        const isEntityModel =
          targetOwner.layer === "entities" &&
          targetOwner.entrypoint === "model";
        const isFeatureModel =
          targetOwner.layer === "features" &&
          targetOwner.entrypoint === "model" &&
          HEADLESS_FEATURE_ENTRYPOINTS.has(targetOwner.name);

        if (!isPublic && !isEntityModel && !isFeatureModel)
          violations.push(`${source} -> ${match[1]}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
