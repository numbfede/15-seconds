/** Client-side player interpolation helpers (server remains authoritative). */
export interface RenderPlayer {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
}
