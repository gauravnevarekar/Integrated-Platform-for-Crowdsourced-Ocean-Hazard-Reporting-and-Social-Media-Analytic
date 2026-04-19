/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
            colors: {
                ocean: {
                    950: '#020C17', // Deepest abyss
                    900: '#031B2A', // Background base
                    800: '#072C42', // Cards/Panels
                    700: '#0F4463', // Borders/Separators
                    600: '#15618A', // Muted accents
                    500: '#1E88E5', // Primary action
                    400: '#42A5F5', // Highlights
                },
                neon: {
                    cyan: '#00F0FF',
                    emerald: '#00FFA3',
                    coral: '#FF5C5C',
                }
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
                glow: {
                    'from': { textShadow: '0 0 10px #00F0FF, 0 0 20px #00F0FF' },
                    'to': { textShadow: '0 0 20px #00F0FF, 0 0 30px #00F0FF' },
                }
            }
        },
    },
    plugins: [],
}
