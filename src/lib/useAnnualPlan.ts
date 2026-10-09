import { useEffect, useState } from 'react';
import type { AnnualPlanDoc } from '../types/documents';

/**
 * The annual plan, re-read every minute.
 *
 * The members' year view is left open on a screen: on a TV in the gym, or on a
 * laptop while the year is being edited in another tab. `useDoc` reads once at
 * mount, which is right for an editor and wrong here, because the wall then
 * shows whatever the plan said when the page happened to be opened, and the
 * only way to see a change is to know to refresh.
 *
 * Read only, so there is no write machinery to share with `useDoc`: a failed
 * read simply leaves the last good plan on the screen.
 */
export function useAnnualPlan(): AnnualPlanDoc | null {
  const [data, setData] = useState<AnnualPlanDoc | null>(null);

  useEffect(() => {
    let live = true;

    const read = async () => {
      try {
        const res = await fetch('/api/store/annual-plan');
        if (!res.ok) return;
        const env = (await res.json()) as { data: AnnualPlanDoc };
        if (live) setData(env.data);
      } catch {
        // Keep showing the last plan we managed to read.
      }
    };

    void read();
    const timer = window.setInterval(read, 60_000);
    // Coming back to the tab should not mean waiting out the minute.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return data;
}
