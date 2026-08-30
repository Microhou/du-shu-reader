// Vite 的 ?url 资源导入类型（独立环境声明文件，避免被当作模块增强）
declare module '*?url' {
  const src: string;
  export default src;
}
