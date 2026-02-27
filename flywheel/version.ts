import { execa } from 'execa';
import semver from 'semver';

const FLYWHEEL_RELEASE_BRANCH_PATTERN = /release-(.*)/

type TagGetter = () => Promise<string[]>;

/**
 * Increment the release version according to Flywheel semantics:
 * - on release branches (e.g. release-2.0.0), add a -flywheel prerelease tag
 * - on MR branches into release branches, do the same and add build meta
 * - return undefined on all other branches
 *
 * @param getTags {TagGetter} - function to retrieve git tags
 * @returns
 */
export async function incver(getTags?: TagGetter): Promise<string> {
  if (!getTags) {
    getTags = getTagsFromGit;
  }
  // CI build
  let nextVersion: string;
  if (isGitlabCI()) {
    if (isMergeRequest()) {
      // Commit in an active merge request
      const sourceBranch = process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME
      const sourceBranchSha = process.env.CI_COMMIT_SHORT_SHA
      const targetBranch = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME
      if (targetBranch.match(FLYWHEEL_RELEASE_BRANCH_PATTERN)) {
        // targeting release branch -> version is -beta build of the release
        const targetBranchVersion = targetBranch.match(FLYWHEEL_RELEASE_BRANCH_PATTERN)[1];
        nextVersion = `${targetBranchVersion}-${makeSourceBranchSuffix(sourceBranch, sourceBranchSha)}`
      } else {
        // targeting other branches -> version is -beta build of 0.0.1
        nextVersion = `0.0.1-${makeSourceBranchSuffix(sourceBranch, sourceBranchSha)}`
      }
    } else if (isReleaseBranch(process.env.CI_COMMIT_BRANCH)) {
      // Commit to a release branch
      const branchName = process.env.CI_COMMIT_BRANCH;
      const branchVersion = branchName.match(FLYWHEEL_RELEASE_BRANCH_PATTERN)[1];
      const versions = await getSemVerFromTags(getTags, branchVersion);
      if (versions.length > 0) {
        nextVersion = semver.inc(versions[versions.length-1], 'prerelease', null, 'flywheel');
      } else {
        nextVersion = `${branchVersion}-flywheel.0`
      }
    }
  }
  return nextVersion
}

function isGitlabCI(): boolean {
  return process.env.CI == 'true';
}

function isMergeRequest(): boolean {
  return process.env.CI_PIPELINE_SOURCE == 'merge_request_event';
}

export function isReleaseBranch(name: string): boolean {
  return name && FLYWHEEL_RELEASE_BRANCH_PATTERN.test(name);
}

function makeSourceBranchSuffix(name: string, sha: string): string {
  return `beta.${name.slice(0, 32)}.${Date.now()}.${sha.slice(0, 8)}`
}

async function getSemVerFromTags(getTags: TagGetter, branchVersion: string): Promise<semver.SemVer[]> {
  const tags = await getTags();
  const versions = tags
    .filter((tag) => tag.startsWith(`v${branchVersion}`))
    .map((tag) => semver.parse(tag))
    .sort(semver.compareBuild);
  return versions;
}

async function getTagsFromGit(): Promise<string[]> {
  const { stdout: tags } = await execa('git', [
    'tag',
    '--merged',
  ]);
  return tags.split('\n');
}
