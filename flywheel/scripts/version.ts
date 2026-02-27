import { incver } from "../version";
import { execa } from 'execa';
import semver from 'semver';
import fs from 'fs/promises';

const nextVersionArg = process.argv[2];

/**
 * Flywheel-specific version of ~/version.mjs
 *
 * @param nextVersion
 */
async function setVersion(nextVersion?: string) {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  console.log('Current branch:', branchName);

  // read the current version from lerna.json
  const lernaJson = JSON.parse(await fs.readFile('lerna.json', 'utf-8'));
  const currentVersion = lernaJson.version;

  console.log('Current version:', currentVersion);

  const { stdout: currentCommitHash } = await execa('git', [
    'rev-parse',
    'HEAD',
  ]);
  console.log('Current commit hash:', currentCommitHash);

  const { stdout: lastCommitMessage } = await execa('git', [
    'log',
    '--format=%B',
    '-n',
    '1',
  ]);

  if (!nextVersion) {
    nextVersion = await incver();
    if (!nextVersion) {
      throw new Error('Could not determine next version');
    }
  }

  console.log('Next version:', nextVersion);
  console.log('Current commit hash:', currentCommitHash);

  const versionInfo = { version: nextVersion, commit: currentCommitHash };
  await fs.writeFile('./version.json', JSON.stringify(versionInfo, null, 2));
  await fs.writeFile('./version.txt', versionInfo.version);
  await fs.writeFile('./commit.txt', versionInfo.commit);

  console.log('Version info saved to version.json');
}

setVersion(nextVersionArg).catch((err) => {
  console.error('Error encountered during new version & commit write:', err);
  process.exit(1);
});
