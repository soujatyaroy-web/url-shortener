// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // This ensures Jest looks for tests inside your new 'tests' folder
  roots: ['<rootDir>/tests'],
};