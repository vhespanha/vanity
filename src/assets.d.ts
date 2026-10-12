// Vite inlines `?inline` imports as strings (minified in builds).
declare module "*.css?inline" {
  const css: string;
  export default css;
}
