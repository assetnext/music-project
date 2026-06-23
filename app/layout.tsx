import type { Metadata } from 'next';
import { Oswald, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Frecuencia — escuchen juntos',
  description: 'Crea una sala, comparte el link, escuchen la misma canción en tiempo real.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${oswald.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-void text-bone font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
