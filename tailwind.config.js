/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#0a0b0a',
        panel: '#121412',
        line: '#23261f',
        phosphor: '#9bff6e',
        phosphorDim: '#5a9c43',
        amber: '#ffb454',
        bone: '#e8e6dc',
        mute: '#6b6f64',
        danger: '#ff6e6e',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.8' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        scan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 -8px' },
        },
        toastIn: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2s cubic-bezier(0,0,0.2,1) infinite',
        blink: 'blink 1.4s ease-in-out infinite',
        scan: 'scan 0.5s linear infinite',
        'toast-in': 'toastIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
