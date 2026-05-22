import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        faction: {
          ironCrown: {
            primary: 'var(--faction-ironCrown-primary)',
            glow: 'var(--faction-ironCrown-glow)',
            shadow: 'var(--faction-ironCrown-shadow)',
          },
          starlight: {
            primary: 'var(--faction-starlight-primary)',
            glow: 'var(--faction-starlight-glow)',
            shadow: 'var(--faction-starlight-shadow)',
          },
          emerald: {
            primary: 'var(--faction-emerald-primary)',
            glow: 'var(--faction-emerald-glow)',
            shadow: 'var(--faction-emerald-shadow)',
          },
          ashen: {
            primary: 'var(--faction-ashen-primary)',
            glow: 'var(--faction-ashen-glow)',
            shadow: 'var(--faction-ashen-shadow)',
          },
          voidChurch: {
            primary: 'var(--faction-voidChurch-primary)',
            glow: 'var(--faction-voidChurch-glow)',
            shadow: 'var(--faction-voidChurch-shadow)',
          },
          aurora: {
            primary: 'var(--faction-aurora-primary)',
            glow: 'var(--faction-aurora-glow)',
            shadow: 'var(--faction-aurora-shadow)',
          },
          magma: {
            primary: 'var(--faction-magma-primary)',
            glow: 'var(--faction-magma-glow)',
            shadow: 'var(--faction-magma-shadow)',
          },
          darkTide: {
            primary: 'var(--faction-darkTide-primary)',
            glow: 'var(--faction-darkTide-glow)',
            shadow: 'var(--faction-darkTide-shadow)',
          },
        },
      },
      boxShadow: {
        'glow-sm': '0 0 0 1px var(--border-glow), 0 0 10px var(--border-glow)',
        'glow-md': '0 0 0 1px var(--border-glow), 0 0 14px var(--border-glow), 0 0 28px var(--border-glow)',
        'glow-lg': '0 0 0 1px var(--border-glow), 0 0 18px var(--border-glow), 0 0 42px var(--border-glow)',
      },
      fontFamily: {
        hud: ['"Share Tech Mono"', '"JetBrains Mono"', '"Noto Sans SC"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        mono: ['"JetBrains Mono"', '"Noto Sans SC"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        scanline: 'scanline 9s linear infinite',
        flicker: 'flicker 4.5s linear infinite',
        'panel-reveal': 'panel-reveal 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-glow': 'pulse-glow 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
      transitionTimingFunction: {
        holo: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        scanline: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100%' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '19%': { opacity: '0.82' },
          '20%': { opacity: '1' },
          '44%': { opacity: '0.9' },
          '45%': { opacity: '1' },
          '72%': { opacity: '0.78' },
          '73%': { opacity: '1' },
        },
        'panel-reveal': {
          '0%': {
            opacity: '0',
            transform: 'scale(0.985)',
            clipPath: 'inset(0 50% 0 50%)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1)',
            clipPath: 'inset(0 0 0 0)',
          },
        },
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 0 1px var(--border-glow), 0 0 12px var(--border-glow)',
          },
          '50%': {
            boxShadow: '0 0 0 1px var(--border-glow), 0 0 22px var(--border-glow), 0 0 42px var(--border-glow)',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
