#!/usr/bin/env node

import consola from 'consola'
import { $ as $$ } from 'execa'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PackageJson } from 'type-fest'
import { addDevDependency } from 'nypm'
import {
    PackageManagerName,
    getPackageManagerByUserAgent,
} from '@akrc/monorepo-tools'

const $ = $$({ shell: true })
const cwd = process.cwd()

consola.info('Current working directory: ', cwd)

const pkgManager = getPackageManagerByUserAgent()
consola.info(`Using package manager: ${pkgManager}`)

const packageJsonPath = path.resolve(cwd, 'package.json')

if (!existsSync(packageJsonPath)) {
    if (pkgManager === PackageManagerName.PNPM) {
        await $`pnpm init`
    } else {
        await $`${pkgManager} init -y`
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
    await addDevDependency(missingDeps, {
        cwd,
        packageManager: pkgManager,
    })
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
        path.resolve(entryPoint),
        `
console.log('Hello, world!')
`.trim(),
    )
    consola.success('Created src/index.ts')
}

consola.info('Entry point: ', entryPoint)
const tsupConfigPath = path.resolve(cwd, 'tsup.config.ts')
if (existsSync(tsupConfigPath)) {
    const next = await consola.prompt(
        'tsup.config.ts already exists, do you want to overwrite it?',
        {
            type: 'confirm',
        },
    )
    if (next) {
        await fs.writeFile(
            tsupConfigPath,
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
    } else {
        consola.error('Aborted')
    }
}
