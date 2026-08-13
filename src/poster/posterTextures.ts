/** Built-in texture/pattern definitions for shapes, text, and images. */
export interface PosterTextureDef {
  id: string;
  name: string;
  /** Data URL or URL of repeatable pattern image. */
  url: string;
}

function createPatternCanvas(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  draw(ctx, size);
  return c.toDataURL('image/png');
}

export const BUILT_IN_TEXTURES: PosterTextureDef[] = [
  {
    id: 'dots',
    name: 'Dots',
    url: createPatternCanvas(16, (ctx, s) => {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }),
  },
  {
    id: 'dots-light',
    name: 'Light dots',
    url: createPatternCanvas(16, (ctx, s) => {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }),
  },
  {
    id: 'lines-h',
    name: 'Horizontal lines',
    url: createPatternCanvas(8, (ctx, s) => {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, s / 2);
      ctx.lineTo(s, s / 2);
      ctx.stroke();
    }),
  },
  {
    id: 'lines-v',
    name: 'Vertical lines',
    url: createPatternCanvas(8, (ctx, s) => {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(s / 2, s);
      ctx.stroke();
    }),
  },
  {
    id: 'crosshatch',
    name: 'Crosshatch',
    url: createPatternCanvas(12, (ctx, s) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s, s);
      ctx.moveTo(s, 0);
      ctx.lineTo(0, s);
      ctx.stroke();
    }),
  },
  {
    id: 'grid',
    name: 'Grid',
    url: createPatternCanvas(12, (ctx, s) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(s / 2, s);
      ctx.moveTo(0, s / 2);
      ctx.lineTo(s, s / 2);
      ctx.stroke();
    }),
  },
  {
    id: 'noise',
    name: 'Noise',
    url: createPatternCanvas(32, (ctx, s) => {
      const d = ctx.getImageData(0, 0, s, s);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.floor(Math.random() * 60);
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 120;
      }
      ctx.putImageData(d, 0, 0);
    }),
  },
  {
    id: 'diagonal',
    name: 'Diagonal stripes',
    url: createPatternCanvas(16, (ctx, s) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s, s);
      ctx.lineTo(s * 2, -s);
      ctx.stroke();
    }),
  },
];

export function getTextureById(id: string): PosterTextureDef | undefined {
  return BUILT_IN_TEXTURES.find((t) => t.id === id);
}
