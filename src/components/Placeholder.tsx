export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white text-center">
      <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-500">{note}</p>
    </div>
  );
}
