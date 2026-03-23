import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZKPay — Instant Insurance Claims',
  description: 'Income-verified instant insurance claim settlement using zero-knowledge proofs on Xion blockchain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
