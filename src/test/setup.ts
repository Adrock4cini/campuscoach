import "@testing-library/jest-dom";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => {},
});

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Persisted drafts, route memory, and study progress are real product state.
// Each test must start from a clean device so one suite's leftovers can never
// resume inside another suite.
import { beforeEach } from "vitest";
beforeEach(() => {
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    /* Storage-less environments are fine. */
  }
});
