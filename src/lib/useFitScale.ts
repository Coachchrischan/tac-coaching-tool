import { useLayoutEffect, useState } from 'react';

/**
 * The factor that fits a fixed-size board inside the window.
 *
 * Both boards used to do this in CSS: `transform: scale(min(calc(100vw /
 * 1920), calc(100vh / 1080)))`. That is invalid. Dividing a length by a number
 * gives a LENGTH, and `scale()` takes a unitless number, so the browser threw
 * the whole declaration away and the board rendered at its natural 1920x1080.
 * On a 1080p screen that looks nearly right, which is why it survived: the
 * board was simply cropped by the browser chrome rather than scaled. Anywhere
 * smaller (a split window, a laptop, the in-app preview pane) it showed a
 * corner of the board and nothing else.
 *
 * Exports never depended on it: they capture at a fixed width and height with
 * the transform forced off. This is the on-screen preview only.
 */
export function useFitScale(width: number, height: number): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / width, window.innerHeight / height));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [width, height]);
  return scale;
}
