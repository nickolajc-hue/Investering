import './globals.css';

export const metadata = {
  title: 'Aktienyhedsfeed',
  description: 'Se de seneste nyheder for dine aktier',
};

export default function RootLayout({ children }) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
