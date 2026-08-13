---
layout: home

hero:
  name: "从零实现 DeepSeek Harness"
  text: "一切皆插件的智能体执行层"
  tagline: 2026 年 8 月 13 日,DeepSeek 官方开源了 deepseek-ai/deepseek-harness(MIT)。本教程基于它的设计理念,带你从零到一用 TypeScript 实现一个包含核心功能的简易版 —— mini-dsh,全程可运行、可测试。
  image:
    src: /deepseek-logo-dark.svg
    alt: DeepSeek
  actions:
    - theme: brand
      text: 开始阅读
      link: /01-about
    - theme: alt
      text: 源码仓库
      link: https://github.com/xbsheng/deepseek-harness-tutorial
    - theme: alt
      text: 官方仓库
      link: https://github.com/deepseek-ai/deepseek-harness

features:
  - icon: 🧩
    title: 一切皆插件
    details: 从模型适配器、工具注册表到 agent 循环本身,全部是插件 —— 每个组件都可替换、可卸载、可逆。
  - icon: 🔁
    title: 会话事件日志
    details: 追加式事件日志是模型上下文的唯一来源。「模型可见的,必须已入日志」。
  - icon: ⚡
    title: Turn / Step 循环
    details: 一个 turn 由若干 step 组成,每个 step 是一次模型请求加它调用的工具 —— 与官方架构同构。
  - icon: 🧪
    title: 25 个测试全绿
    details: 插件生命周期、SSE 流解析、工具管线、完整 agent 回合、流式 Web 输出,全部有真实测试兜底。
---
