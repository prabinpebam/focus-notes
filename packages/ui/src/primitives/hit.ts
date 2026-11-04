/**
 * The pointer target grows to `target` (a component token aliasing size.hit) around a smaller visual box, by an invisible
 * ::after that changes neither the look nor the layout (spacing SP-6). Its host is positioned. Pass the
 * box's block size, its inline size for a square control (omit it for a wide one), and its border width:
 * an absolute box is placed from the padding box, inside the border.
 */
export const hitReach = (target: string, block: string, inline?: string, border?: string) => {
  const reach = (size: string) => (border ? `calc((${size} - ${target}) / 2 - ${border})` : `calc((${size} - ${target}) / 2)`);
  return {
    content: '""',
    position: "absolute",
    insetBlock: reach(block),
    insetInline: inline ? reach(inline) : border ? `calc(-1 * ${border})` : 0,
  } as const;
};