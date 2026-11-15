export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const repoUrl = "https://github.com/d3ara1n/asterism";
export const releasesUrl = `${repoUrl}/releases`;
export const sdkUrl = `${repoUrl}/tree/main/packages/sdk`;
export const authorUrl = "https://dearain.dev";

export type HeroNodeId = "writer" | "reviewer" | "notes" | "folder" | "terminal";
export type GlyphName =
  | "agent"
  | "note"
  | "folder"
  | "terminal"
  | "pool"
  | "todo"
  | "schedule"
  | "web"
  | "manual"
  | "copy"
  | "check";

export interface PlatformAsset {
  id: "mac" | "win" | "linux";
  os: string;
  arch: string;
  type: string;
  asset: string;
}

interface Content {
  htmlLang: string;
  title: string;
  description: string;
  skipToContent: string;
  nav: {
    source: string;
    switchLabel: string;
    switchName: string;
  };
  hero: {
    lede: string;
    sublede: string;
    canvasLabel: string;
    unlinkedMeta: string;
    unroutedMeta: string;
    download: string;
    source: string;
    toggleLinkLabel: string;
    nodes: Record<HeroNodeId, { title: string; meta: string }>;
  };
  story: {
    label: string;
    mock: {
      kindAgent: string;
      kindDirectory: string;
      kindNote: string;
      kindTerminal: string;
      statusWorking: string;
      statusReady: string;
      noteTitle: string;
      noteLine1: string;
      noteLine2: string;
      userPrompt: string;
      toolRead: string;
      writerDraft: string;
      unlinkedBadge: string;
      incomingFrom: string;
      incomingBody: string;
      reviewerReply: string;
    };
    historyLabels: {
      earlier: string;
      kept: string;
      branch: string;
    };
    steps: { title: string; body: string }[];
  };
  primitives: {
    title: string;
    body: string;
    items: { glyph: GlyphName; name: string; detail: string }[];
  };
  plugins: {
    title: string;
    body: string;
    sdkLink: string;
    diagram: {
      builtinTitle: string;
      builtinTag: string;
      builtinItems: string[];
      yoursTitle: string;
      yoursTag: string;
      yoursItems: string[];
      sdkLayer: string;
      hostTitle: string;
      hostItems: string[];
    };
  };
  principles: { term: string; detail: string }[];
  download: {
    title: string;
    status: string;
    recommended: string;
    all: string;
    copy: string;
    copied: string;
    platforms: PlatformAsset[];
    quarantine: { summary: string; body: string };
  };
  footer: {
    author: string;
    releases: string;
    license: string;
  };
}

const basePlatforms = {
  mac: {
    id: "mac" as const,
    os: "macOS",
    type: "DMG",
    asset: "-mac-arm64.dmg",
  },
  win: {
    id: "win" as const,
    os: "Windows",
    arch: "x64",
    type: "EXE",
    asset: "-win-x64.exe",
  },
  linux: {
    id: "linux" as const,
    os: "Linux",
    arch: "x86_64",
    type: "AppImage",
    asset: "-linux-x86_64.AppImage",
  },
};

export const content: Record<Locale, Content> = {
  en: {
    htmlLang: "en",
    title: "Asterism — a local-first workbench for agents",
    description:
      "Organize agents, files, terminals, and services on one local workbench. Explicit links decide access, and work history stays inspectable as a tree.",
    skipToContent: "Skip to content",
    nav: {
      source: "GitHub",
      switchLabel: "Read in Chinese",
      switchName: "中文",
    },
    hero: {
      lede: "A local-first workbench for working with agents.",
      sublede:
        "Place agents, local files, terminals, and external tools on one canvas. Directed links decide access; branching history keeps every turn on record.",
      canvasLabel:
        "Interactive session diagram: two agents with a note, a directory, and a terminal. Cards can be dragged and links can be toggled.",
      unlinkedMeta: "No linked resources",
      unroutedMeta: "No report route",
      download: "Download",
      source: "View source",
      toggleLinkLabel: "Toggle link from {from} to {to}",
      nodes: {
        writer: { title: "Writer", meta: "Drafting release notes" },
        reviewer: { title: "Reviewer", meta: "Awaiting report" },
        notes: { title: "Release brief", meta: "Note" },
        folder: { title: "~/asterism", meta: "Directory" },
        terminal: { title: "zsh", meta: "npm run build" },
      },
    },
    story: {
      label: "How Asterism works",
      mock: {
        kindAgent: "Agent",
        kindDirectory: "Directory",
        kindNote: "Note",
        kindTerminal: "Terminal",
        statusWorking: "Working",
        statusReady: "Ready",
        noteTitle: "Release brief",
        noteLine1: "Highlight link boundaries",
        noteLine2: "Keep changelog concise",
        userPrompt: "Draft the v0.2 release notes from recent changes.",
        toolRead: "Read",
        writerDraft: "Prepared a three-section draft covering link access and history.",
        unlinkedBadge: "Unlinked",
        incomingFrom: "Writer",
        incomingBody: "Release notes draft is ready for verification against CHANGELOG.md.",
        reviewerReply: "Verified every entry against current files—no missing breaking changes.",
      },
      historyLabels: {
        earlier: "Earlier turn",
        kept: "Previous path kept",
        branch: "Active branch",
      },
      steps: [
        {
          title: "One canvas per piece of work.",
          body: "Agents, project directories, shared notes, and live terminals sit together as cards in a session—visible at once instead of buried in chat tabs.",
        },
        {
          title: "Links decide access.",
          body: "Being on the canvas grants nothing. Draw a directed link to expose a directory or note; unlinked terminals and files stay outside the agent’s reach.",
        },
        {
          title: "Separate contexts, explicit handoffs.",
          body: "One agent is already complete. Add another when work benefits from an independent context—reports travel across directed links without merging memory.",
        },
        {
          title: "History branches without faking rollback.",
          body: "Return to any earlier turn and continue on a new branch while preserving the prior path. Recorded history and current files on disk stay distinct.",
        },
      ],
    },
    primitives: {
      title: "Concrete resources, unified model.",
      body: "Every capability is an object you place and connect on the workbench.",
      items: [
        {
          glyph: "agent",
          name: "Agents & Mesh",
          detail: "Conversational agents with reusable roles, linked directly on the canvas or across sessions via Mesh channels.",
        },
        {
          glyph: "folder",
          name: "Directories & Notes",
          detail: "Operate on real project files on disk, or keep a shared brief and working checklist inside the session.",
        },
        {
          glyph: "terminal",
          name: "Interactive Terminals",
          detail: "Share a live shell and foreground process between you and the agents you connect to it.",
        },
        {
          glyph: "pool",
          name: "Subagent Pools & Todo",
          detail: "Delegate bounded investigations with dedicated resource access, and coordinate shared tasks across sessions.",
        },
        {
          glyph: "web",
          name: "Web, MCP & Schedules",
          detail: "Connect search providers, MCP tool servers, external chats, and interval or weekday reminders.",
        },
        {
          glyph: "manual",
          name: "In-app Manual",
          detail: "Link the built-in Manual resource so an agent can consult Asterism and plugin guides on demand and explain them in your language.",
        },
      ],
    },
    plugins: {
      title: "Paradigms are plugins.",
      body: "The built-in agent experience holds no private privileges in the host. Resources, tools, views, and new agent paradigms all load through the same public SDK.",
      sdkLink: "Explore @asterism-app/sdk",
      diagram: {
        builtinTitle: "builtin",
        builtinTag: "Bundled plugin",
        builtinItems: ["Agents, Roles & Mesh", "Directory, Note, Terminal & Manual", "Subagents, Todo, Web & MCP"],
        yoursTitle: "Your plugin",
        yoursTag: "Same boundary",
        yoursItems: ["Custom resources & tools", "Workbench cards & islands", "New execution paradigms"],
        sdkLayer: "@asterism-app/sdk  ·  @asterism-app/builtin-api",
        hostTitle: "Asterism Host",
        hostItems: ["Sessions", "Link authorization", "History tree", "Native islands"],
      },
    },
    principles: [
      {
        term: "Local-first",
        detail: "Sessions, SQLite history, and settings live on your machine. Nothing leaves except requests to providers you configure.",
      },
      {
        term: "Your models",
        detail: "Connect Anthropic, OpenAI, or compatible relays directly. Model connections stay separate from reusable agent roles.",
      },
      {
        term: "Open source",
        detail: "MIT licensed—inspect the host runtime, shared contracts, and built-in plugin in one repository.",
      },
    ],
    download: {
      title: "Download",
      status: "Preview builds",
      recommended: "For this device",
      all: "All releases",
      copy: "Copy",
      copied: "Copied",
      platforms: [
        { ...basePlatforms.mac, arch: "Apple Silicon" },
        basePlatforms.win,
        basePlatforms.linux,
      ],
      quarantine: {
        summary: "macOS says the app cannot be opened?",
        body: "Preview builds use a self-signed certificate rather than Apple notarization. After moving Asterism to Applications, clear the quarantine attribute:",
      },
    },
    footer: {
      author: "dearain.dev",
      releases: "Releases",
      license: "MIT License",
    },
  },
  zh: {
    htmlLang: "zh-CN",
    title: "Asterism — 本地优先的智能体工作台",
    description:
      "在同一张本地工作台上组织智能体、文件、终端与外部服务。显式链接决定访问边界，会话历史以树状结构完整留存。",
    skipToContent: "跳至正文",
    nav: {
      source: "GitHub",
      switchLabel: "Read in English",
      switchName: "EN",
    },
    hero: {
      lede: "本地优先的智能体工作台。",
      sublede:
        "把智能体、本地文件、终端与外部工具放在同一张画布上。有向链接决定访问边界，树状历史完整保留每一次推进。",
      canvasLabel: "可交互会话示例：两个智能体与笔记、目录、终端相连。可拖动卡片，也可点击连线切换访问状态。",
      unlinkedMeta: "未链接任何资源",
      unroutedMeta: "未连接汇报路径",
      download: "下载应用",
      source: "查看源码",
      toggleLinkLabel: "切换从 {from} 到 {to} 的链接",
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
      mock: {
        kindAgent: "智能体",
        kindDirectory: "目录",
        kindNote: "笔记",
        kindTerminal: "终端",
        statusWorking: "运行中",
        statusReady: "就绪",
        noteTitle: "发布简报",
        noteLine1: "重点说明链接授权边界",
        noteLine2: "保持变更摘要精炼",
        userPrompt: "根据近期改动起草 v0.2 发布说明。",
        toolRead: "读取",
        writerDraft: "已整理三段发布说明草稿，涵盖链接访问与历史分支。",
        unlinkedBadge: "未链接",
        incomingFrom: "撰写者",
        incomingBody: "发布说明草稿已就绪，请对照 CHANGELOG.md 核查。",
        reviewerReply: "已逐项核对当前仓库文件，无遗漏破坏性变更。",
      },
      historyLabels: {
        earlier: "早期节点",
        kept: "原路径完整保留",
        branch: "当前分支",
      },
      steps: [
        {
          title: "一项工作，一张画布。",
          body: "智能体、项目目录、共享笔记与实时终端以卡片形式共处一个会话，同屏可见，不再淹没在孤立的聊天标签页里。",
        },
        {
          title: "链接决定访问边界。",
          body: "摆在画布上不代表可用。只有连上有向链接，智能体才能读取对应目录或笔记；未链接的终端与文件始终留在边界之外。",
        },
        {
          title: "独立上下文，显式交接。",
          body: "单个智能体已是完整工作空间。需要独立视角或审阅时再引入新成员——汇报沿有向链接传递，不混用各自的上下文。",
        },
        {
          title: "历史可分支，不伪装回滚。",
          body: "随时回到任意旧节点开辟新分支，原有路径依然保留；会话记录与磁盘文件的当前真实状态清晰分明。",
        },
      ],
    },
    primitives: {
      title: "具象资源，统一模型。",
      body: "所有能力都归属于你在工作台上放置并连接的具体对象。",
      items: [
        {
          glyph: "agent",
          name: "智能体与 Mesh",
          detail: "支持可复用角色；既可在画布内直接连接，也能通过 Mesh 频道跨会话发现与通信。",
        },
        {
          glyph: "folder",
          name: "目录与笔记",
          detail: "直接操作磁盘上的真实项目文件，或在会话内维护共享简报与核对清单。",
        },
        {
          glyph: "terminal",
          name: "交互式终端",
          detail: "与已链接的智能体共用同一个实时 Shell 会话与前台程序。",
        },
        {
          glyph: "pool",
          name: "子智能体池与待办",
          detail: "在独立资源环境与预算内委派有界调查，并跨会话协同维护共享待办任务。",
        },
        {
          glyph: "web",
          name: "网页、MCP 与定时提醒",
          detail: "按需接入搜索服务、MCP 工具服务器、外部聊天渠道，以及倒计时或按周触发的提醒。",
        },
        {
          glyph: "manual",
          name: "内置手册资源",
          detail: "将 Manual 资源链接给智能体，由模型在软件内按需翻阅用法与插件指南，并用你的语言结合当前工作作答。",
        },
      ],
    },
    plugins: {
      title: "范式即插件。",
      body: "内置智能体在宿主中没有私有特权。资源、工具、卡片视图乃至全新的智能体协作范式，均通过同一套公开 SDK 加载。",
      sdkLink: "查看 @asterism-app/sdk",
      diagram: {
        builtinTitle: "builtin",
        builtinTag: "官方内置插件",
        builtinItems: ["智能体、角色与 Mesh", "目录、笔记、终端与内置手册", "子智能体池、待办、Web 与 MCP"],
        yoursTitle: "你的插件",
        yoursTag: "对等扩展边界",
        yoursItems: ["自定义资源与操作工具", "工作台卡片与分栏视图", "新的执行与组织范式"],
        sdkLayer: "@asterism-app/sdk  ·  @asterism-app/builtin-api",
        hostTitle: "Asterism 宿主",
        hostItems: ["会话管理", "链接授权边界", "历史树存储", "原生多栏视口"],
      },
    },
    principles: [
      {
        term: "本地优先",
        detail: "会话、SQLite 历史记录与配置均保存在本机，仅向你自行配置的服务商发起请求。",
      },
      {
        term: "自选模型",
        detail: "直连 Anthropic、OpenAI 或兼容中转服务；模型连接与可复用的智能体角色彼此独立。",
      },
      {
        term: "开源透明",
        detail: "MIT 许可公开开发，宿主运行时、共享契约与内置插件同仓可查。",
      },
    ],
    download: {
      title: "下载",
      status: "预览版构建",
      recommended: "匹配当前设备",
      all: "全部版本",
      copy: "复制",
      copied: "已复制",
      platforms: [
        { ...basePlatforms.mac, arch: "Apple 芯片" },
        basePlatforms.win,
        basePlatforms.linux,
      ],
      quarantine: {
        summary: "macOS 提示无法打开应用？",
        body: "预览版安装包使用自签名证书（暂未经过 Apple 公证）。将 Asterism 移入「应用程序」后，可在终端清除隔离属性：",
      },
    },
    footer: {
      author: "dearain.dev",
      releases: "版本发布",
      license: "MIT 许可",
    },
  },
};
