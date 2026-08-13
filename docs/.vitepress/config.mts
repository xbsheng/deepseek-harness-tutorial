import { defineConfig } from "vitepress";

// 侧边栏(中文)
const zhSidebar = [
  {
    text: "起步",
    items: [
      { text: "序章:认识 DeepSeek Harness", link: "/01-about" },
      { text: "环境准备与项目骨架", link: "/02-setup" },
    ],
  },
  {
    text: "核心实现",
    items: [
      { text: "插件系统 mini-Cordis", link: "/03-plugin" },
      { text: "会话事件日志", link: "/04-session" },
      { text: "LLM 适配器缝隙", link: "/05-llm" },
      { text: "工具系统", link: "/06-tools" },
      { text: "Agent 循环", link: "/07-agent" },
    ],
  },
  {
    text: "组装与运行",
    items: [
      { text: "示例插件:提示词/Shell/文件/技能", link: "/08-plugins" },
      { text: "CLI 与启动", link: "/09-cli" },
      { text: "测试与验证", link: "/10-test" },
      { text: "Web UI(SSE 流式)", link: "/11-web" },
    ],
  },
  {
    text: "发布",
    items: [
      { text: "VitePress + GitHub Pages 部署", link: "/12-deploy" },
      { text: "附录:与官方架构对照", link: "/reference/mapping" },
      { text: "附录:与主流 Coding Agent 对比", link: "/reference/comparison" },
    ],
  },
];

// 侧边栏(英文)
const enSidebar = [
  {
    text: "Getting Started",
    items: [
      { text: "About DeepSeek Harness", link: "/en/01-about" },
      { text: "Setup & Project Skeleton", link: "/en/02-setup" },
    ],
  },
  {
    text: "Core Implementation",
    items: [
      { text: "Plugin System (mini-Cordis)", link: "/en/03-plugin" },
      { text: "Session Event Log", link: "/en/04-session" },
      { text: "LLM Adapter Seam", link: "/en/05-llm" },
      { text: "Tool System", link: "/en/06-tools" },
      { text: "Agent Loop", link: "/en/07-agent" },
    ],
  },
  {
    text: "Assembly & Running",
    items: [
      { text: "Example Plugins: Prompt/Shell/FS/Skills", link: "/en/08-plugins" },
      { text: "CLI & Startup", link: "/en/09-cli" },
      { text: "Testing & Verification", link: "/en/10-test" },
      { text: "Web UI (SSE Streaming)", link: "/en/11-web" },
    ],
  },
  {
    text: "Publishing",
    items: [
      { text: "VitePress + GitHub Pages", link: "/en/12-deploy" },
      { text: "Appendix: Mapping to the Official Codebase", link: "/en/reference/mapping" },
      { text: "Appendix: vs Mainstream Coding Agents", link: "/en/reference/comparison" },
    ],
  },
];

export default defineConfig({
  // 默认(根)语言:中文;英文版挂在 /en/ 下
  lang: "zh-CN",
  title: "从零实现 DeepSeek Harness",
  description: "基于最新开源的 deepseek-ai/deepseek-harness,从零到一实现一个包含核心功能的简易版(TS)。",
  base: "/deepseek-harness-tutorial/",

  head: [
    ["link", { rel: "icon", href: "/deepseek-harness-tutorial/favicon.svg", type: "image/svg+xml" }],
    // hero 图片在深色模式下换用浅色版 logo(导航 logo 由 config 的 light/dark 处理)
    ["style", {}, `.dark .VPImage.image-src { content: url("/deepseek-harness-tutorial/deepseek-logo-light.svg"); }`],
  ],

  locales: {
    root: { label: "中文", lang: "zh-CN" },
    en: { label: "English", lang: "en" },
  },

  lastUpdated: true,

  themeConfig: {
    // 注意:logo/hero 图片路径由 VitePress 自动加 base 前缀,只写 /文件名
    // 导航 logo 按主题切换:浅色背景用深色鲸鱼,深色背景用白色鲸鱼
    logo: {
      light: "/deepseek-logo-dark.svg",
      dark: "/deepseek-logo-light.svg",
    },
    editLink: {
      pattern: "https://github.com/xbsheng/deepseek-harness-tutorial/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "基于 MIT 许可的 deepseek-ai/deepseek-harness 设计理念 · 本教程为独立教学项目,与 DeepSeek 官方无隶属关系",
      copyright: "MIT License",
    },
    search: {
      provider: "local",
      options: {
        locales: {
          "zh-CN": {
            translations: {
              button: { buttonText: "搜索教程", buttonAriaLabel: "搜索" },
              modal: { noResultsText: "未找到相关结果", resetButtonTitle: "清除查询条件", footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" } },
            },
          },
          en: {
            translations: {
              button: { buttonText: "Search", buttonAriaLabel: "Search" },
              modal: { noResultsText: "No results found", resetButtonTitle: "Clear search criteria", footer: { selectText: "to select", navigateText: "to switch", closeText: "to close" } },
            },
          },
        },
      },
    },
    locales: {
      root: {
        label: "中文",
        nav: [
          { text: "教程", link: "/01-about" },
          { text: "官方仓库", link: "https://github.com/deepseek-ai/deepseek-harness" },
          { text: "本教程源码", link: "https://github.com/xbsheng/deepseek-harness-tutorial" },
        ],
        sidebar: zhSidebar,
        outline: { label: "本页目录", level: [2, 3] },
        docFooter: { prev: "上一篇", next: "下一篇" },
        lastUpdated: { text: "最后更新于" },
        returnToTopLabel: "回到顶部",
        sidebarMenuLabel: "菜单",
        darkModeSwitchLabel: "主题",
        lightModeSwitchTitle: "切换到浅色模式",
        darkModeSwitchTitle: "切换到深色模式",
      },
      en: {
        label: "English",
        nav: [
          { text: "Tutorial", link: "/en/01-about" },
          { text: "Official Repo", link: "https://github.com/deepseek-ai/deepseek-harness" },
          { text: "Source", link: "https://github.com/xbsheng/deepseek-harness-tutorial" },
        ],
        sidebar: enSidebar,
        outline: { label: "On this page", level: [2, 3] },
        docFooter: { prev: "Previous", next: "Next" },
        lastUpdated: { text: "Last updated" },
        returnToTopLabel: "Back to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Theme",
        lightModeSwitchTitle: "Switch to light mode",
        darkModeSwitchTitle: "Switch to dark mode",
      },
    },
  },
});
