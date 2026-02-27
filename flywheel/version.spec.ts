import {describe, it, expect, beforeEach} from 'bun:test';
import semver from 'semver';

import { incver } from './version';

async function getTags(): Promise<string[]> {
  return Promise.resolve([
    "v2.2.20-flywheel.0"
  ])
}

// Helper to reset process.env
function resetEnv() {
  for (const key in process.env) {
    delete process.env[key];
  }
}

describe('incver', () => {
  beforeEach(() => {
    resetEnv();
  });

  it('should increment -flywheel version on commits to release branch with no tags', async () => {
    const getTags = async () => {
      return Promise.resolve([])
    }
    process.env.CI = 'true';
    process.env.CI_COMMIT_BRANCH = 'release-2.2.20';
    const nextVersion = await incver(getTags);
    expect(nextVersion).toMatch(/2\.2\.20-flywheel\.0/);
  });

  it('should increment -flywheel version on commits to release branch with existing tags', async () => {
    const getTags = async (): Promise<string[]> => {
      return Promise.resolve(['v2.2.20-flywheel.0'])
    }
    process.env.CI = 'true';
    process.env.CI_COMMIT_BRANCH = 'release-2.2.20';
    const nextVersion = await incver(getTags);
    expect(nextVersion).toMatch(/2\.2\.20-flywheel\.1/);
  });

  it('should increment -flywheel version and add build info on MR branches', async () => {
    process.env.CI = 'true';
    process.env.CI_PIPELINE_SOURCE = 'merge_request_event';
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME = 'feature-xyz';
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = 'release-2.2.20';
    process.env.CI_COMMIT_SHORT_SHA = "abcd1234"
    const nextVersion = await incver(getTags);
    expect(nextVersion).toMatch(/2\.2\.20-beta\.feature-xyz\.\d+\.abcd1234/);
  });

  it('should return undefined if not in CI', async () => {
    process.env.CI = 'false';
    const nextVersion = await incver(getTags);
    expect(nextVersion).toBeUndefined();
  });

  it('should return undefined if not a merge request or release branch', async () => {
    process.env.CI = 'true';
    process.env.CI_PIPELINE_SOURCE = 'push';
    process.env.CI_COMMIT_BRANCH = 'main';
    const nextVersion = await incver(getTags);
    expect(nextVersion).toBeUndefined();
  });

  it('versions should sort in the correct order', async () => {
    const versions = [
      '1.0.0-flywheel.0',
      '1.0.0-flywheel.1',
      '1.0.0-beta.FLYW-1234.1755024486.abcd1234',
      '1.0.0-beta.FLYW-1234.1755024490.bcde1234',
    ].map(semver.parse)
    const matchingVersion = semver.maxSatisfying(versions, '^1.0.0-flywheel')
    expect(matchingVersion.toString()).toBe('1.0.0-flywheel.1')
  })
});
