import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2b4acb', light: '#eef2ff', dark: '#1e35a0' },
        accent: { DEFAULT: '#ff6b35', light: '#fff1ea' },
      },
    },
  },
  plugins: [],
};

export default config;
