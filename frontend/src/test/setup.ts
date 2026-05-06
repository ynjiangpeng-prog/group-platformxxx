import "@testing-library/jest-dom"

// Vitest类型声明
declare module "vitest" {
  export interface Assertion<T = any> extends CustomMatchers<T> {}
  export interface AsymmetricMatchersContaining extends CustomMatchers {}
}

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R
  toHaveClass(className: string): R
}
