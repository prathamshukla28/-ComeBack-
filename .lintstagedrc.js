/** @type {import('lint-staged').Config} */
module.exports = {
  '*.{ts,tsx,js,jsx}': (files) => {
    const targets = files.filter((f) => !/(?:^|\/)\.[^/]+$/.test(f));
    if (targets.length === 0) return [];
    const list = targets.map((f) => `"${f}"`).join(' ');
    // ESLint ignores *.config.js (see .eslintrc ignorePatterns); don't feed
    // those to eslint or --max-warnings=0 trips on the "file ignored" warning.
    const lintable = targets.filter((f) => !/\.config\.js$/.test(f));
    const cmds = [];
    if (lintable.length) {
      const lintList = lintable.map((f) => `"${f}"`).join(' ');
      cmds.push(`eslint --fix --max-warnings=0 ${lintList}`);
    }
    cmds.push(`prettier --write ${list}`);
    return cmds;
  },
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
