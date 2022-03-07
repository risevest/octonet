module.exports = {
  testEnvironment: "node",
  verbose: false,
  roots: ["<rootDir>"],
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },
  testRegex: "/tests/.*\\.spec.ts",
  testPathIgnorePatterns: [],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"]
};
