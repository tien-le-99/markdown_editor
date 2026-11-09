import '@testing-library/jest-dom';

// Polyfill ResizeObserver for DOM components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Complete Canvas mock for ECharts execution in JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => {
    const dummyFn = () => {};
    const dummyGradient = { addColorStop: dummyFn };

    const ctx = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'canvas') return {};
        if (prop === 'measureText') return () => ({ width: 100, height: 14 });
        if (prop === 'getImageData') return () => ({ data: [] });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
          return () => dummyGradient;
        }
        if (prop === 'getLineDash') return () => [];
        return dummyFn;
      },
      set: () => true,
    });

    return ctx;
  }) as any;
}
