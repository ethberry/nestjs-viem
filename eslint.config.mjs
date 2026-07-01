import typescriptRules from "@ethberry/eslint-config/presets/ts.mjs";
import mochaRules from "@ethberry/eslint-config/tests/mocha.mjs";

// DON'T ADD ANY RULES!
// FIX YOUR SHIT!!!

export default [
  {
    ignores: ["**/dist"],
  },

  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.eslint.json"],
        },
      },
    },
  },

  ...typescriptRules,
  ...mochaRules,
];
