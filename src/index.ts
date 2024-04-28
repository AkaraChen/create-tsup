#!/usr/bin/env node

import consola from 'consola'
import { $ as $$ } from 'execa'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PackageJson } from 'type-fest'

const $ = $$({ shell: true })
const error = (msg: string) => {
    consola.error(msg)
    process.exit(1)
}
const cwd = process.cwd()

consola.info('Current working directory: ', cwd)

const userAgent = process.env.npm_config_user_agent
if (!userAgent) {
    error('Cannot detect package manager')
}
const pkgManager = userAgent.split('/')[0]
consola.info(`Using package manager: ${pkgManager}`)

const packageJsonPath = path.resolve(cwd, 'package.json')
if (!existsSync(packageJsonPath)) {
    switch (pkgManager) {
        case 'npm':
            await $`npm init -y`
            break
        case 'yarn':
            await $`yarn init -y`
            break
        case 'pnpm':
            await $`pnpm init`
            break
    }
}

const getPackageJson = async () => {
    return JSON.parse(
        await fs.readFile(packageJsonPath, 'utf-8'),
    ) as PackageJson
}

let packageJson: PackageJson = await getPackageJson()

const deps = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
]
    .filter(Boolean)
    // @ts-ignore
    .map(Object.keys)
    .flat()
const requiredDeps = ['typescript', 'tsup', 'tslib']
const missingDeps = requiredDeps.filter(dep => !deps.includes(dep))
if (missingDeps.length > 0) {
    consola.info('Missing dependencies: ', missingDeps)

    switch (pkgManager) {
        case 'npm':
            await $`npm install -D ${missingDeps.join(' ')}`
            break
        case 'yarn':
            await $`yarn add -D ${missingDeps.join(' ')}`
            break
        case 'pnpm':
            await $`pnpm add -D ${missingDeps.join(' ')}`
            break
    }
}

packageJson = await getPackageJson()

await fs.writeFile(
    packageJsonPath,
    JSON.stringify(
        {
            ...packageJson,
            scripts: {
                ...packageJson.scripts,
                build: 'tsup',
            },
        },
        null,
        2,
    ),
)
consola.success('Added build script to package.json')

const tryEntrys = [
    './src/index.ts',
    './src/index.js',
    './index.ts',
    './index.js',
]
let entryPoint = tryEntrys.find(existsSync)

if (!entryPoint) {
    entryPoint = './src/index.ts'
    await fs.mkdir(path.resolve(cwd, 'src'), { recursive: true })
    await fs.writeFile(
        path.resolve(cwd, 'src/index.ts'),
        `
console.log('Hello, world!')
`.trim(),
    )
    consola.success('Created src/index.ts')
}

consola.info('Entry point: ', entryPoint)
await fs.writeFile(
    path.resolve(cwd, 'tsup.config.ts'),
    `
import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["${entryPoint}"],
  format: ["cjs", "esm"],
  dts: true,
});
`.trim(),
)
consola.success('Created tsup.config.ts')
