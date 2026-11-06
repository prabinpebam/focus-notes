export function disabledPaintErrors(css: string): string[];
export function lint(): Promise<{ files: number; errors: string[]; warnings: string[] }>;
