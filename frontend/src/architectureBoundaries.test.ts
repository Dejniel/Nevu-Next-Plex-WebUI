// @vitest-environment node
import fs from "fs";
import path from "path";
import { parseSync, Visitor } from "oxc-parser";

const SOURCE_ROOT = import.meta.dirname;
const HEADLESS_FEATURE_ENTRYPOINTS = new Set([
  "session",
  "settings",
  "library",
  "library-navigation",
  "home",
  "watchlist",
  "media-lists",
  "media-actions",
  "music",
  "photos",
]);
const SOURCE_EXTENSION = /\.(ts|tsx)$/;

function dependencies(file: string, contents: string, runtimeOnly = false) {
  const parsed = parseSync(file, contents);
  expect(parsed.errors).toEqual([]);
  const imports = parsed.module.staticImports
    .filter(
      (statement) =>
        !runtimeOnly ||
        statement.entries.length === 0 ||
        statement.entries.some((entry) => !entry.isType),
    )
    .map((statement) => statement.moduleRequest.value);
  const exports = parsed.module.staticExports.flatMap((statement) =>
    statement.entries.flatMap((entry) =>
      entry.moduleRequest && (!runtimeOnly || !entry.isType) ? [entry.moduleRequest.value] : [],
    ),
  );
  const dynamic: string[] = [];
  if (!runtimeOnly) {
    new Visitor({
      ImportExpression(node) {
        if (node.source.type === "Literal" && typeof node.source.value === "string")
          dynamic.push(node.source.value);
      },
    }).visit(parsed.program);
  }
  return [...new Set([...imports, ...exports, ...dynamic])];
}

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
  it("separates runtime edges from type imports and deferred loading", () => {
    const source = `
      import type { Shape } from "./shape";
      import { type Color } from "./color";
      import { draw, type Canvas } from "./drawing";
      import "./setup";
      export type { Size } from "./size";
      export { paint, type Brush } from "./painting";
      const later = () => import("./lazy");
      // import "./comment";
      const text = 'import "./text"';
    `;
    expect(dependencies("fixture.ts", source)).toEqual([
      "./shape",
      "./color",
      "./drawing",
      "./setup",
      "./size",
      "./painting",
      "./lazy",
    ]);
    expect(dependencies("fixture.ts", source, true)).toEqual([
      "./drawing",
      "./setup",
      "./painting",
    ]);
  });

  it("keeps browse and media-action features free of runtime import cycles", () => {
    const files = sourceFiles(SOURCE_ROOT).filter(
      (file) => !file.includes(".test.") && !file.endsWith(".d.ts"),
    );
    const known = new Set(files);
    const graph = new Map(
      files.map((file) => {
        const imports: string[] = [];
        dependencies(file, fs.readFileSync(file, "utf8"), true).forEach((specifier) => {
          const target = targetPath(file, specifier);
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
      .filter((file) => /^features\/(library|watchlist|media-lists|media-actions|title-details)\//.test(sourcePath(file)))
      .forEach(visit);
    expect(cycles).toEqual([]);
  });

  it("uses public entrypoints for imports across feature and entity modules", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = sourcePath(file);
      const owner = moduleOwner(source);
      const contents = fs.readFileSync(file, "utf8");

      for (const specifier of dependencies(file, contents)) {
        const target = targetPath(file, specifier);
        if (!target) continue;
        const targetOwner = moduleOwner(target);
        if (!targetOwner) continue;
        if (owner?.layer === targetOwner.layer && owner.name === targetOwner.name) continue;

        const isPublic = targetOwner.entrypoint === "public";
        const isAppRoute = source.startsWith("app/") && targetOwner.entrypoint === "routes";
        const isEntityModel =
          targetOwner.layer === "entities" && targetOwner.entrypoint === "model";
        const isFeatureModel =
          targetOwner.layer === "features" &&
          targetOwner.entrypoint === "model" &&
          HEADLESS_FEATURE_ENTRYPOINTS.has(targetOwner.name);

        if (!isPublic && !isAppRoute && !isEntityModel && !isFeatureModel)
          violations.push(`${source} -> ${specifier}`);
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

      for (const specifier of dependencies(file, contents)) {
        const target = targetPath(file, specifier);
        if (!target) continue;
        const targetLayer = moduleLayer(target);

        const sharedViolation = sourceLayer === "shared" && targetLayer !== "shared";
        const entityViolation =
          sourceLayer === "entities" &&
          (targetLayer === "app" || targetLayer === "features") &&
          target !== "features/session/model";
        const featureViolation = sourceLayer === "features" && targetLayer === "app";

        if (sharedViolation || entityViolation || featureViolation)
          violations.push(`${source} -> ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps runtime modules inside an architectural layer", () => {
    const allowedRootFiles = new Set(["architectureBoundaries.test.ts", "index.tsx", "types.d.ts"]);
    const rootRuntimeFiles = fs
      .readdirSync(SOURCE_ROOT, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && SOURCE_EXTENSION.test(entry.name) && !allowedRootFiles.has(entry.name),
      )
      .map((entry) => entry.name);

    expect(rootRuntimeFiles).toEqual([]);
  });
});
