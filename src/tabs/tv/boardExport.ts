// Rasterising a DOM node to a PNG, shared by the TV board, the block overview
// and the designer pack.
//
// html-to-image's toPng uses img.decode(), which can hang in background tabs,
// so the SVG -> canvas -> PNG conversion is done by hand with onload. The
// node is captured at its authored size and drawn onto a canvas of the
// requested output size, so a 1080p board can be exported at 1440p or 4K
// without the layout knowing: text and vector marks re-rasterise sharp, and
// only the backdrop photos are limited by their own pixels.

import { toSvg } from 'html-to-image';

export interface Resolution {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** 16:9 export sizes for the board. 1080p is what the gym TVs run today. */
export const BOARD_RESOLUTIONS: Resolution[] = [
  { id: '1080p', label: '1080p · 1920 x 1080', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p · 2560 x 1440', width: 2560, height: 1440 },
  { id: '4k', label: '4K · 3840 x 2160', width: 3840, height: 2160 },
];

export interface CaptureOptions {
  /** The node's authored size (what it is laid out at, transforms aside). */
  width: number;
  height: number;
  /** Output pixels; defaults to the authored size. */
  outWidth?: number;
  outHeight?: number;
  /** 'image/png' (default) or 'image/jpeg' with a quality for big packs. */
  type?: 'image/png' | 'image/jpeg';
  quality?: number;
}

export async function captureNodePng(node: HTMLElement, opts: CaptureOptions): Promise<string> {
  const { width, height } = opts;
  const outWidth = opts.outWidth ?? width;
  const outHeight = opts.outHeight ?? height;
  const svgUrl = await toSvg(node, { width, height, style: { transform: 'none' } });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('render failed'));
    img.src = svgUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, outWidth, outHeight);
  return canvas.toDataURL(opts.type ?? 'image/png', opts.quality);
}

/** Trigger a browser download of a data URL or a text blob. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadText(text: string, filename: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    downloadDataUrl(url, filename);
  } finally {
    // Give the click a tick to start before the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
