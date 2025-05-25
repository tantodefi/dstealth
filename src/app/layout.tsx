import React from 'react';
import { headers } from 'next/headers';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookies = await headers().get("cookie");

  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
} 