"use strict";

module.exports = {
  require: ["ts-node/register", "choma"],
  spec: ["test/**/*.spec.ts"],
  watch: false,
  exit: true,
  timeout: "5s",
  "watch-files": ["src/**/*.ts", "test/**/*.spec.ts"]
};
