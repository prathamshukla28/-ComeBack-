/** @type {import('lint-staged').Config} */
module.exports = {
  '*.{ts,tsx,js,jsx}': ['eslint --fix --max-warnings=10', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
