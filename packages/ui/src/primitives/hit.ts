/**
 * The pointer target grows to `target` (a component token aliasing size.hit) around a smaller visual box, by an invisible
 * ::after that changes neither the look nor the layout (spacing SP-6). Its host is positioned. Pass the
 * box's block size, and its inline size for a square control; omit inline for a wide one.
 */
export const hitReach = (target: string, block: string, inline?: string) => ({
  content: '""',
  position: "absolute",
  insetBlock: `calc((${block} - ${target}) / 2)`,
  insetInline: inline ? `calc((${inline} - ${target}) / 2)` : 0,
}) as const;