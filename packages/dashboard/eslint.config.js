import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "no-empty": "off",
      "no-constant-binary-expression": "off",
    },
  },
);