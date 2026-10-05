const setup = require('./electron-builder.setup.json');
const manifest = require('./package.json');
const repository =
  process.env.DOT_GITHUB_REPOSITORY ||
  (typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url);
const match = repository
  ?.replace(/^git\+/, '')
  .match(/^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
if (!match) {
  throw new Error(
    'Set DOT_GITHUB_REPOSITORY to owner/repo, or add the public GitHub repository URL to package.json before building an auto-updating installer.',
  );
}
module.exports = {
  ...setup,
  publish: [{ provider: 'github', owner: match[1], repo: match[2], releaseType: 'release' }],
};
