import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Brand — calmer than v1's saturated violet.
        // Primary: a softer "wizard purple" with cooler undertones.
        ink: {
          50: '#F7F7FB',
          100: '#EDEDF5',
          200: '#D8D8E5',
          300: '#B8B8CC',
          400: '#8B8BA8',
          500: '#6B6B85',
          600: '#4A4A60',
          700: '#33334A',
          800: '#22223A',
          900: '#15152B',
          950: '#0C0C1F',
        },
        wizard: {
          50: '#F4F0FF',
          100: '#E9DFFF',
          200: '#D5C2FF',
          300: '#B89AFF',
          400: '#9870FF',
          500: '#7C4DFF', // primary
          600: '#6633E0',
          700: '#5524BB',
          800: '#421A8F',
          900: '#2E126B',
        },
        spell: {
          // Accent — a warm gold for celebration / XP
          50: '#FFF8E5',
          100: '#FFEFC2',
          200: '#FFE08A',
          300: '#FFD24D',
          400: '#FFC020',
          500: '#FFAA00',
          600: '#E68E00',
          700: '#B36E00',
          800: '#7A4B00',
          900: '#523200',
        },
        leaf: {
          // Success/correct — softer than emerald
          50: '#EFFAF3',
          100: '#D4F2DD',
          200: '#A6E3B6',
          300: '#6FCE89',
          400: '#3DB562',
          500: '#1F9D49',
          600: '#157C39',
          700: '#10602D',
          800: '#0C4423',
          900: '#072E18',
        },
        ember: {
          // Wrong/warning — warmer than red, less alarming for kids
          50: '#FFF1EE',
          100: '#FFD9CF',
          200: '#FFB59E',
          300: '#FF8B6A',
          400: '#F56340',
          500: '#E14823',
          600: '#B8351A',
          700: '#8C2614',
          800: '#5F1A0E',
          900: '#3A0F08',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        'wizard': '0 8px 32px -8px rgba(124, 77, 255, 0.25), 0 4px 16px -4px rgba(124, 77, 255, 0.15)',
        'wizard-lg': '0 16px 48px -12px rgba(124, 77, 255, 0.30), 0 8px 24px -8px rgba(124, 77, 255, 0.20)',
        'card': '0 1px 3px 0 rgba(15, 15, 35, 0.06), 0 1px 2px 0 rgba(15, 15, 35, 0.04)',
        'card-hover': '0 8px 24px -4px rgba(15, 15, 35, 0.10), 0 4px 8px -2px rgba(15, 15, 35, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 280ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-up': 'slideUp 320ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-down': 'slideDown 320ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'pop': 'pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'shake': 'shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'shimmer': 'shimmer 2s linear infinite',
        'wizard-float': 'wizardFloat 3s ease-in-out infinite',
        'sparkle': 'sparkle 1.4s ease-in-out infinite',
        'xp-pop': 'xpPop 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'level-up': 'levelUp 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'progress-fill': 'progressFill 800ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        wizardFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        sparkle: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.1)' },
        },
        xpPop: {
          '0%': { opacity: '0', transform: 'translateY(0) scale(0.8)' },
          '20%': { opacity: '1', transform: 'translateY(-8px) scale(1.1)' },
          '100%': { opacity: '0', transform: 'translateY(-48px) scale(1)' },
        },
        levelUp: {
          '0%': { opacity: '0', transform: 'scale(0.6) rotate(-8deg)' },
          '60%': { opacity: '1', transform: 'scale(1.08) rotate(2deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        progressFill: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
