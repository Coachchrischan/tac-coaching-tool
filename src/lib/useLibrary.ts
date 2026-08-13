import { useEffect, useState } from 'react';
import { loadLibrary } from './library';
import type { LibraryExercise } from './library';

export function useLibrary(): { library: LibraryExercise[] | null; error: boolean } {
  const [library, setLibrary] = useState<LibraryExercise[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((lib) => {
        if (!cancelled) setLibrary(lib);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { library, error };
}
