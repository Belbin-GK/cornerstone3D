/**
 * Forked from ~/publish-package.ts
 *
 * Adds support for publishing with npm. Publishing with lerna requires a clean
 * git repository, which requires you to update the package version and version
 * files and commit them. However, this is not ideal in MR branches so
 * publishing with npm is sufficient.
 * @author Ken Goetter <kengoettler@flywheel.io>
 */
import fs from 'fs/promises';
import { execa, type ExecaChildProcess } from 'execa';
import { isReleaseBranch } from '../version';

type Args = {
  lerna: boolean;
}

const REGISTRY_URL = 'https://gitlab.com/api/v4/projects/72780435/packages/npm/'


function parseArgs(): Args {
  const args = process.argv.slice(2);
  const noLerna = args.includes('--no-lerna');
  return {
    lerna: !noLerna
  }
}

async function publishLerna(branchName: string) {
  const baseLernaArgs = [
    'lerna',
    'publish',
    'from-package',
    '--no-verify-access',
    '--yes',
    '--registry',
    REGISTRY_URL,
  ]
  if (isReleaseBranch(branchName)) {
    await execa('npx', baseLernaArgs);
  } else {
    // publish beta versions
    await execa('npx', baseLernaArgs.concat(['--dist-tag', 'beta']));
  }
}

async function publishBun(branchName: string) {
  const baseBunArgs = [
    'publish',
    '--no-git-checks',
    '--registry',
    REGISTRY_URL,
  ]

  // Loop over each package and call bun publish
  const lernaJson = JSON.parse(await fs.readFile('lerna.json', 'utf-8'));
  const packages: string[] = lernaJson.packages;
  const originalDir = process.cwd();
  for (const pkgGlob of packages) {
    // Expand glob if needed, but for simplicity, assume direct paths
    const pkgDir = pkgGlob.replace('/*', '');
    try {
      process.chdir(pkgDir);
      if (isReleaseBranch(branchName)) {
        console.info(`Publishing ${pkgDir}`)
        const res = await execa('bun', baseBunArgs);
        if (res.exitCode != 0) {
          console.error(`Failed to publish ${pkgDir}`)
          console.error(res.stderr)
        }
      } else {
        await execa('bun', baseBunArgs.concat(['--tag', 'beta']));
      }
    } catch (error) {
        console.error(`Failed to publish ${pkgDir}`)
        console.error(error)
    } finally {
      process.chdir(originalDir);
    }
  }
}


async function run(args: Args) {

  let branchName = process.env.CI_COMMIT_BRANCH;
  if (!branchName) {
    const { stdout } = await execa('git', [
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ]);
    branchName = stdout;
  }

  if (args.lerna) {
    await publishLerna(branchName);
  } else {
    await publishBun(branchName);
  }
  console.log('Finished');
}

const args = parseArgs();
run(args).catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
