import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { SIDEWALK_DB: ":memory:" },
  },
});
