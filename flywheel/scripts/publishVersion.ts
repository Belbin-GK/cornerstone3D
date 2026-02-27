/**
 * Forked from ~/publish-version.ts
 * @author Ken Goetter <kengoettler@flywheel.io>
 */
import { execa } from 'execa';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

type Args = {
  noCommit: boolean;
  noLerna: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const skipCommit = args.includes('--no-commit');
  const skipLerna = args.includes('--no-lerna');
  return {
    noCommit: skipCommit,
    noLerna: skipLerna,
  }
}

async function run(args: Args) {
  // Parse command-line arguments
  const {noCommit, noLerna} = args;
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  console.log('Current branch:', branchName);
  const lernaJson = JSON.parse(await fs.readFile('lerna.json', 'utf-8'));

  // read the current version from ./version.txt
  const nextVersion = await fs.readFile('./version.txt', 'utf-8');
  const packages = lernaJson.packages;

  if (!packages) {
    throw new Error('Could not find packages in lerna.json');
  }

  // Get the npm package names for the packages we are publishing
  const npmPackageNames = [];
  for (const packagePathPattern of packages) {
    // Use glob to find all matching directories
    const matchingDirectories = glob.sync(packagePathPattern);

    for (const packageDirectory of matchingDirectories) {
      const packageJsonPath = path.join(packageDirectory, 'package.json');

      npmPackageNames.push(
        JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')).name
      );
    }
  }

  // add packages/docs so that we can update the peer dependencies
  packages.push('packages/docs');

  // for each package's package.json file, see if there is a peerdependency,
  // and for each peer dependency see if it includes a package that
  // starts with @ohif/, if so update the version to the
  // next version since lerna will not handle this for us

  // Iterate over each package path pattern
  for (const packagePathPattern of packages) {
    // Use glob to find all matching directories
    const matchingDirectories = glob.sync(packagePathPattern);

    for (const packageDirectory of matchingDirectories) {
      const packageJsonPath = path.join(packageDirectory, 'package.json');

      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf-8')
        );

        // If we're not using lerna to version, then set the version manually
        if (args.noLerna) {
          console.log(`Setting version to ${nextVersion}`)
          packageJson.version = nextVersion;
        }

        // Iterate over peerDependencies, dependencies, and devDependencies
        for (const dependencyType of [
          'peerDependencies',
          'dependencies',
          'devDependencies',
        ]) {
          const dependencies = packageJson[dependencyType];

          if (!dependencies) {
            continue;
          }

          for (const dependency of Object.keys(dependencies)) {
            if (
              dependency.startsWith('@cornerstonejs/') &&
              npmPackageNames.includes(dependency)
            ) {
              dependencies[dependency] = `^${nextVersion}`;

              console.log(
                `updating ${dependencyType} of ${dependency} to `,
                dependencies[dependency]
              );
            }
          }
        }

        console.log("Writing package.json")
        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + '\n'
        );

        // run prettier on the package.json file
        await execa('npx', ['prettier', '--write', packageJsonPath]);

        console.log(`Updated ${packageJsonPath}`);
      } catch (err) {
        // This could be a directory without a package.json file. Ignore and continue.
        continue;
      }
    }
  }

  if (!noCommit) {
    console.log('Committing and pushing changes...');
    await execa('git', ['add', '-A']);
    await execa('git', [
      'commit',
      '--no-verify',
      '-m',
      'chore(version): version.json [skip ci]',
    ]);
    await execa('git', ['push', 'origin', branchName]);
  } else {
    console.log('Skipping git commit and push (--no-commit)');
  }

  if (!noLerna) {
    console.log('Setting the version using lerna...');
    // add a message to the commit to indicate that the version was set using lerna
    await execa('npx', [
      'lerna',
      'version',
      nextVersion,
      '--yes',
      '--exact',
      '--force-publish',
      '--message',
      'chore(version): Update package versions [skip ci]',
      '--conventional-commits',
    ]);
    console.log('Version set using lerna');
  } else {
    console.log('Skipping lerna version (--no-lerna)');
  }
}

async function unlinkFile(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    console.log(`${filePath} has been deleted`);
  } catch (error) {
    console.log(`${filePath} does not exist or an error occurred:`, error);
  }
}

const args = parseArgs();
run(args).catch((err) => {
  console.error('Error encountered during version bump:', err);
  process.exit(1);
});
