---
layout: home

hero:
  name: 'Build DeepSeek Harness from Scratch'
  text: 'An agent harness where everything is a plugin'
  image:
    src: /deepseek-logo-dark.svg
    alt: DeepSeek
  actions:
    - theme: brand
      text: Start Reading
      link: /en/01-about
    - theme: alt
      text: Source Repo
      link: https://github.com/xbsheng/deepseek-harness-tutorial
    - theme: alt
      text: Official Repo
      link: https://github.com/deepseek-ai/deepseek-harness

features:
  - icon: 🧩
    title: Everything is a plugin
    details: The model adapter, the tool registry, and the agent loop itself are all plugins — every component is swappable, unloadable, and reversible.
  - icon: 🔁
    title: Session event log
    details: An append-only event log is the single source of truth for the model's context. "What the model sees must be in the log."
  - icon: ⚡
    title: Turn / Step loop
    details: A turn is made of steps; each step is one model request plus the tools it calls — isomorphic with the official architecture.
  - icon: 🧪
    title: 25 tests, all green
    details: Plugin lifecycle, SSE parsing, tool pipeline, full agent turns, and streaming web output are all covered by real tests.
---
