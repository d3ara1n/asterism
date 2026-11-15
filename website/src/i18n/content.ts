export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const repoUrl = "https://github.com/d3ara1n/asterism";
export const releasesUrl = `${repoUrl}/releases`;
export const manualUrl = `${repoUrl}/tree/main/docs/manual`;

interface Content {
  htmlLang: string;
  title: string;
  description: string;
  nav: { download: string; source: string; switchLabel: string; switchName: string };
  hero: {
    lede: string;
    canvasLabel: string;
    download: string;
    source: string;
    nodes: Record<"writer" | "reviewer" | "notes" | "folder" | "terminal", { title: string; meta: string }>;
  };
  story: {
    label: string;
    steps: { title: string; body: string }[];
    unlinked: string;
  };
  plugins: { title: string; body: string; link: string; host: string; builtin: string; yours: string };
  principles: { term: string; detail: string }[];
  download: {
    title: string;
    status: string;
    latest: string;
    all: string;
    platforms: { os: string; arch: string; type: string; asset: string }[];
    quarantine: { summary: string; body: string };
  };
  footer: { license: string };
}

const platforms = {
  mac: { os: "macOS", type: "DMG", asset: "-mac-arm64.dmg" },
  win: { os: "Windows", arch: "x64", type: "EXE", asset: "-win-x64.exe" },
  linux: { os: "Linux", arch: "x64", type: "AppImage", asset: "-linux-x86_64.AppImage" },
};

export const content: Record<Locale, Content> = {
  en: {
    htmlLang: "en",
    title: "Asterism — a local-first workbench for agents",
    description:
      "Agents, resources, and work history share one canvas. Link material to the agents that need it, and continue from any point in history.",
    nav: { download: "Download", source: "GitHub", switchLabel: "Read in Chinese", switchName: "中文" },
    hero: {
      lede: "A local-first workbench for working with agents.",
      canvasLabel: "An example session: two agents linked to a note, a directory, and a terminal. Cards can be dragged.",
      download: "Download",
      source: "View source",
      nodes: {
        writer: { title: "Writer", meta: "Drafting release notes" },
        reviewer: { title: "Reviewer", meta: "Waiting for a report" },
        notes: { title: "Release brief", meta: "Note" },
        folder: { title: "~/asterism", meta: "Directory" },
        terminal: { title: "zsh", meta: "npm run build" },
      },
    },
    story: {
      label: "How Asterism works",
      unlinked: "Not linked",
      steps: [
        { title: "One canvas per piece of work.", body: "Agents, notes, folders, and terminals sit together as cards in a session." },
        { title: "Links decide access.", body: "An agent uses what you link to it. Being on the canvas is not enough." },
        { title: "Every agent, its own context.", body: "Each agent keeps its own conversation and links. Directed links let work pass between them." },
        { title: "History branches.", body: "Return to any earlier point and continue. The previous path stays on record." },
      ],
    },
    plugins: {
      title: "Paradigms are plugins.",
      body: "The built-in agent is one plugin. Resources, tools, and views come from plugins too, and yours load the same way.",
      link: "Read the manual",
      host: "Asterism",
      builtin: "builtin",
      yours: "Your plugin",
    },
    principles: [
      {
        term: "Local-first",
        detail: "Sessions, history, and settings stay on your computer. Model requests go to the provider you configure.",
      },
      { term: "Your models", detail: "Connect the providers and relays you already use." },
      { term: "Open source", detail: "MIT licensed and developed in the open." },
    ],
    download: {
      title: "Download",
      status: "Early development",
      latest: "Latest build",
      all: "All releases",
      platforms: [
        { ...platforms.mac, arch: "Apple Silicon" },
        platforms.win,
        platforms.linux,
      ],
      quarantine: {
        summary: "macOS won’t open the app?",
        body: "Builds use a self-signed certificate. If you trust the download, clear the quarantine flag:",
      },
    },
    footer: { license: "MIT License" },
  },
  zh: {
    htmlLang: "zh-CN",
    title: "Asterism — 本地优先的智能体工作台",
    description: "智能体、资源与工作历史共处一张画布。把材料链接给需要它的智能体，并从历史的任意节点继续。",
    nav: { download: "下载", source: "GitHub", switchLabel: "Read in English", switchName: "EN" },
    hero: {
      lede: "本地优先的\n智能体工作台。",
      canvasLabel: "示例会话：两个智能体，链接着一份笔记、一个目录和一个终端。卡片可以拖动。",
      download: "下载",
      source: "查看源码",
      nodes: {
        writer: { title: "撰写者", meta: "正在起草发布说明" },
        reviewer: { title: "审阅者", meta: "等待汇报" },
        notes: { title: "发布简报", meta: "笔记" },
        folder: { title: "~/asterism", meta: "目录" },
        terminal: { title: "zsh", meta: "npm run build" },
      },
    },
    story: {
      label: "Asterism 如何工作",
      unlinked: "未链接",
      steps: [
        { title: "一项工作，一张画布。", body: "智能体、笔记、文件夹和终端，以卡片的形式共处于一个会话。" },
        { title: "链接决定访问。", body: "智能体只能使用链接给它的资源。出现在画布上并不意味着可用。" },
        { title: "每个智能体，各自的上下文。", body: "每个智能体拥有自己的对话与链接。有向链接让工作在它们之间传递。" },
        { title: "历史可以分支。", body: "回到任意节点继续工作，原来的路径完整保留。" },
      ],
    },
    plugins: {
      title: "范式即插件。",
      body: "内置智能体本身就是一个插件。资源、工具和视图同样来自插件，你编写的插件也以相同方式加载。",
      link: "阅读手册",
      host: "Asterism",
      builtin: "builtin",
      yours: "你的插件",
    },
    principles: [
      { term: "本地优先", detail: "会话、历史和设置保存在你的电脑上。模型请求发往你配置的服务商。" },
      { term: "自选模型", detail: "接入你已经在用的模型服务与中转站。" },
      { term: "开源", detail: "MIT 许可，公开开发。" },
    ],
    download: {
      title: "下载",
      status: "早期开发中",
      latest: "最新构建",
      all: "全部版本",
      platforms: [
        { ...platforms.mac, arch: "Apple 芯片" },
        platforms.win,
        platforms.linux,
      ],
      quarantine: {
        summary: "macOS 无法打开应用？",
        body: "安装包使用自签名证书。确认下载来源可信后，清除隔离标记：",
      },
    },
    footer: { license: "MIT 许可" },
  },
};
