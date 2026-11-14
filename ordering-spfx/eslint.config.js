const profile = require("@microsoft/eslint-config-spfx/lib/flat-profiles/react");
module.exports = [
  { ignores: ["src/services/adapter/**"] },
  ...profile,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: __dirname, project: "./tsconfig.json" },
    },
  },
];
