import fs from "fs";
import path from "path";
import ts from "typescript";

const SOURCE_ROOT = __dirname;
const HEADLESS_FEATURE_ENTRYPOINTS = new Set([
  "session",
  "settings",
  "library",
  "library-navigation",
  "search",
  "watch-together",
  "watchlist",
  "media-lists",
]);
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
  if (
    specifier.startsWith("app/") ||
    specifier.startsWith("features/") ||
    specifier.startsWith("entities/") ||
    specifier.startsWith("shared/")
  )
    return specifier;
  if (!specifier.startsWith(".")) return null;
  return sourcePath(path.resolve(path.dirname(file), specifier));
}

function moduleLayer(relativePath: string) {
  return relativePath.split("/")[0];
}

function moduleOwner(relativePath: string) {
  const match = relativePath.match(/^(features|entities)\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { layer: match[1], name: match[2], entrypoint: match[3] || "" };
}

describe("frontend module boundaries", () => {
  it("keeps browse features free of runtime import cycles", () => {
    const files = sourceFiles(SOURCE_ROOT).filter(
      (file) => !file.includes(".test.") && !file.endsWith(".d.ts"),
    );
    const known = new Set(files);
    const graph = new Map(
      files.map((file) => {
        const parsed = ts.createSourceFile(
          file,
          fs.readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
        );
        const imports: string[] = [];
        parsed.statements.forEach((statement) => {
          if (
            !ts.isImportDeclaration(statement) &&
            !ts.isExportDeclaration(statement)
          )
            return;
          if (
            !statement.moduleSpecifier ||
            !ts.isStringLiteral(statement.moduleSpecifier)
          )
            return;
          if (
            ts.isImportDeclaration(statement)
              ? statement.importClause?.isTypeOnly
              : statement.isTypeOnly
          )
            return;
          const target = targetPath(file, statement.moduleSpecifier.text);
          if (!target) return;
          const base = path.join(SOURCE_ROOT, target);
          const resolved = [
            base,
            `${base}.ts`,
            `${base}.tsx`,
            path.join(base, "index.ts"),
            path.join(base, "index.tsx"),
          ].find((candidate) => known.has(candidate));
          if (resolved) imports.push(resolved);
        });
        return [file, imports] as const;
      }),
    );
    const visited = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    const visit = (file: string) => {
      const position = stack.indexOf(file);
      if (position >= 0) {
        cycles.push([...stack.slice(position), file].map(sourcePath));
        return;
      }
      if (visited.has(file)) return;
      visited.add(file);
      stack.push(file);
      graph.get(file)?.forEach(visit);
      stack.pop();
    };
    files
      .filter((file) =>
        /^features\/(library|watchlist|media-lists)\//.test(sourcePath(file)),
      )
      .forEach(visit);
    expect(cycles).toEqual([]);
  });

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
        const isAppRoute =
          source.startsWith("app/") && targetOwner.entrypoint === "routes";
        const isEntityModel =
          targetOwner.layer === "entities" &&
          targetOwner.entrypoint === "model";
        const isFeatureModel =
          targetOwner.layer === "features" &&
          targetOwner.entrypoint === "model" &&
          HEADLESS_FEATURE_ENTRYPOINTS.has(targetOwner.name);

        if (!isPublic && !isAppRoute && !isEntityModel && !isFeatureModel)
          violations.push(`${source} -> ${match[1]}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps dependencies flowing toward shared infrastructure", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = sourcePath(file);
      const sourceLayer = moduleLayer(source);
      const contents = fs.readFileSync(file, "utf8");

      for (const match of contents.matchAll(IMPORT)) {
        const target = targetPath(file, match[1]);
        if (!target) continue;
        const targetLayer = moduleLayer(target);

        const sharedViolation =
          sourceLayer === "shared" && targetLayer !== "shared";
        const entityViolation =
          sourceLayer === "entities" &&
          (targetLayer === "app" || targetLayer === "features") &&
          target !== "features/session/model";
        const featureViolation =
          sourceLayer === "features" && targetLayer === "app";

        if (sharedViolation || entityViolation || featureViolation)
          violations.push(`${source} -> ${match[1]}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps runtime modules inside an architectural layer", () => {
    const allowedRootFiles = new Set([
      "architectureBoundaries.test.ts",
      "index.tsx",
      "react-app-env.d.ts",
      "types.d.ts",
    ]);
    const rootRuntimeFiles = fs
      .readdirSync(SOURCE_ROOT, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          SOURCE_EXTENSION.test(entry.name) &&
          !allowedRootFiles.has(entry.name),
      )
      .map((entry) => entry.name);

    expect(rootRuntimeFiles).toEqual([]);
  });
});
