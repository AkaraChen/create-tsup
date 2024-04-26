import consola from "consola";
import path from "node:path";
import fs from "node:fs/promises";
import { $ as $$ } from "execa";
import { PackageJson } from "type-fest";
import { accessSync } from "node:fs";

const cwd = process.cwd();
consola.info("Current working directory: ", cwd);

const packageJsonPath = path.resolve(cwd, "package.json");
const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
const packageJson: PackageJson = JSON.parse(packageJsonContent);

const deps = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
]
    .filter(Boolean)
    // @ts-ignore
    .map(Object.keys)
    .flat();
const requiredDeps = ["typescript", "tsup", "tslib"];
const missingDeps = requiredDeps.filter((dep) => !deps.includes(dep));
if (missingDeps.length > 0) {
    consola.info("Missing dependencies: ", missingDeps);
    const userAgent = process.env.npm_config_user_agent;
    if (!userAgent) {
        throw new Error("Cannot detect package manager");
    }
    const pkgManager = userAgent.split("/")[0];
    consola.info(`Using package manager: ${pkgManager}`);
    const $ = $$({ shell: true });

    switch (pkgManager) {
        case "npm":
            await $`npm install -D ${missingDeps.join(" ")}`;
            break;
        case "yarn":
            await $`yarn add -D ${missingDeps.join(" ")}`;
            break;
        case "pnpm":
            await $`pnpm add -D ${missingDeps.join(" ")}`;
            break;
    }
}

await fs.writeFile(
    packageJsonPath,
    JSON.stringify(
        {
            ...packageJson,
            scripts: {
                ...packageJson.scripts,
                build: "tsup",
            },
        },
        null,
        2
    )
);
consola.success("Added build script to package.json");

const tryEntrys = [
    "./src/index.ts",
    "./src/index.js",
    "./index.ts",
    "./index.js",
];
const entryPoint = tryEntrys.find((entry) => {
    try {
        return accessSync(path.resolve(cwd, entry));
    } catch (error) {
        return false;
    }
}) || "./index.ts";
consola.info("Entry point: ", entryPoint);
await fs.writeFile(
    path.resolve(cwd, "tsup.config.ts"),
    `
import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["${entryPoint}"],
  format: ["cjs", "esm"],
  dts: true,
});
`.trim()
);
consola.success("Created tsup.config.ts");