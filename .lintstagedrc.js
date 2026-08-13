/** @type {import('lint-staged').Config} */
module.exports = {
  '*.{ts,tsx,js,jsx}': (files) => {
    const targets = files.filter((f) => !/(?:^|\/)\.[^/]+$/.test(f));
    if (targets.length === 0) return [];
    const list = targets.map((f) => `"${f}"`).join(' ');
    return [`eslint --fix --max-warnings=0 ${list}`, `prettier --write ${list}`];
  },
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
