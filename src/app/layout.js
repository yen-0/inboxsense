import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'InboxSense',
  description: 'AI-powered Gmail inbox assistant',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
