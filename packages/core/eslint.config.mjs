import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.strict, {
  rules: {
    // المال لا يُحسب بأرقام JavaScript العادية — استخدم Decimal
    "no-restricted-globals": ["error", { name: "parseFloat", message: "Use Decimal for money." }],
  },
});
