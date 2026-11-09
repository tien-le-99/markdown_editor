import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Markdown Workspace | Interactive WYSIWYG & Visual Editor',
  description: 'Production-grade interactive Markdown Workspace featuring real-time bidirectional sync, interactive ECharts, Mermaid diagrams, GFM tables, and high-fidelity PDF export.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased bg-slate-50 text-slate-900 selection:bg-brand-500/20 selection:text-brand-900">
        {children}
      </body>
    </html>
  );
}
