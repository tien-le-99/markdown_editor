import dynamic from 'next/dynamic';

const Editor = dynamic(
  () => import('@/components/editor/Editor').then((mod) => mod.Editor),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Editor />
    </div>
  );
}
