/**
 * Every colour resolves through a CSS variable so the same markup can render
 * Bright Mode (default) and Dark Mode (the original look).
 * Variables are RGB triplets, which keeps Tailwind opacity modifiers working.
 */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        subbase: v('subbase'),
        surface: v('surface'),
        panel: v('panel'),
        panel2: v('panel2'),
        input: v('input'),
        popover: v('popover'),
        cell: v('cell'),
        overlay: v('overlay'),
        line: v('line'),
        lineSoft: v('lineSoft'),
        lineHover: v('lineHover'),
        subtle: v('subtle'),
        subtleHover: v('subtleHover'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        cyan: v('cyan'),
        blue: v('blue'),
        violet: v('violet'),
        success: v('success'),
        warning: v('warning'),
        critical: v('critical'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        float: 'var(--shadow-float)',
        cyan: 'var(--shadow-cyan)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(350%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-soft': 'pulse-soft 2.6s ease-in-out infinite',
        sweep: 'sweep 1.8s ease-in-out infinite',
      },
      letterSpacing: {
        telemetry: '0.14em',
      },
    },
  },
  plugins: [],
}
