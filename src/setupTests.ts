import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock geolocation API
const mockGeolocation = {
  getCurrentPosition: jest.fn()
    .mockImplementation((success) =>
      Promise.resolve(
        success({
          coords: {
            latitude: 37.5565,
            longitude: 126.9242,
            accuracy: 10,
          },
        })
      )
    ),
  watchPosition: jest.fn(),
};

Object.defineProperty(window.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true,
});
