/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // Git worktrees live under .claude/worktrees/ (see AGENTS.md). Anchor to
  // <rootDir> so the main checkout skips them while a worktree, whose own path
  // contains that segment, still runs its tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/worktrees/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
