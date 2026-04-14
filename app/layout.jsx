import './globals.css';

export const metadata = {
  title: 'Aktienyhedsfeed',
  description: 'Se de seneste nyheder for dine aktier',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Aktier',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
