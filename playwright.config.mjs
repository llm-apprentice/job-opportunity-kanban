export default {
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177',
    url: 'http://127.0.0.1:5177',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5177',
    viewport: { width: 1440, height: 1000 },
  },
};
