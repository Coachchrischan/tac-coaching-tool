import { useParams } from 'react-router-dom';

export default function TvPage() {
  const { sessionId } = useParams();
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 text-white">
      <div className="text-center">
        <p className="text-sm tracking-widest text-ink-400 uppercase">TV output</p>
        <h1 className="mt-2 text-3xl font-semibold">Session {sessionId}</h1>
        <p className="mt-2 text-ink-400">1920×1080 workout display. Built in phase 4.</p>
      </div>
    </div>
  );
}
