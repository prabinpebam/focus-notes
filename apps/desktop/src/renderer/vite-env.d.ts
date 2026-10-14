/** Vite's `?worker&url` imports: the built worker file's address (the search index, WP-4.1). */
declare module "*?worker&url" {
  const url: string;
  export default url;
}
