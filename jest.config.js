module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        jsx: 'react-jsx'
      }
    }]
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/style-mock.js',
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
