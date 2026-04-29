import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Math Wizard Pro',
  description:
    'Truly AI-powered adaptive math learning. Personalized questions, smart hints, and step-by-step solutions for K-12.',
  applicationName: 'Math Wizard Pro',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#7C4DFF',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-white focus:text-wizard-700 focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-wizard"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
