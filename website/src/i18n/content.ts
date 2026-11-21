import type { IconName } from "../components/icons";

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const repoUrl = "https://github.com/d3ara1n/asterism";
export const releasesUrl = `${repoUrl}/releases`;
export const sdkUrl = `${repoUrl}/tree/main/packages/sdk`;
export const authorUrl = "https://dearain.dev";

export interface PlatformAsset {
  id: "mac" | "win" | "linux";
  os: string;
  arch: string;
  type: string;
  asset: string;
}

/** Labels inside the mock application window. Interface labels mirror the app's own English and Chinese strings. */
interface DemoUi {
  sessionTitle: string;
  home: string;
  conversations: string;
  folders: string;
  recent: string;
  noFolder: string;
  folderName: string;
  sessions: string[];
  looseSessions: string[];
  add: string;
  layout: string;
  access: string;
  objects: string;
  history: string;
  menuAgents: string;
  menuResources: string;
  kinds: {
    agent: string;
    directory: string;
    note: string;
    terminal: string;
    web: string;
    mcp: string;
    pool: string;
    todo: string;
    manual: string;
  };
  writer: string;
  reviewer: string;
  role: string;
  noteTitle: string;
  noteHeading: string;
  noteLines: string[];
  placeholder: string;
  saveDraft: string;
  workingHint: string;
  sessionSource: string;
  pause: string;
  play: string;
  emptyConversation: string;
  readText: string;
  send: string;
  accepted: string;
  prompt: string;
  reply: string;
  incoming: string;
  review: string;
  followUp: string;
  revised: string;
  accessTitle: string;
  byReceiver: string;
  byResource: string;
  recipient: string;
  canAccess: string;
  linked: string;
  notLinked: string;
  accessBoundary: string;
  main: string;
  branch: string;
  allRecords: string;
  searchHistory: string;
  sessionStart: string;
  you: string;
  continueHere: string;
  branchesHere: string;
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
    download: string;
    source: string;
  };
  demo: {
    label: string;
    chapters: { title: string; body: string }[];
    ui: DemoUi;
  };
  resources: {
    title: string;
    body: string;
    items: { icon: IconName; kind: string; title: string; meta: string }[];
    plugin: { kind: string; title: string; meta: string };
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
    asset: "Asterism-mac-arm64.dmg",
  },
  win: {
    id: "win" as const,
    os: "Windows",
    arch: "x64",
    type: "EXE",
    asset: "Asterism-win-x64.exe",
  },
  linux: {
    id: "linux" as const,
    os: "Linux",
    arch: "x86_64",
    type: "AppImage",
    asset: "Asterism-linux-x86_64.AppImage",
  },
};

export const content: Record<Locale, Content> = {
  en: {
    htmlLang: "en",
    title: "Asterism — a desktop workbench for agents",
    description:
      "Organize agents, files, terminals, and services on one desktop workbench. Explicit links decide access, and work history stays inspectable as a tree.",
    skipToContent: "Skip to content",
    nav: {
      source: "GitHub",
      switchLabel: "Read in Chinese",
      switchName: "中文",
    },
    hero: {
      lede: "A desktop workbench for working with agents.",
      sublede:
        "Agents, files, terminals, and services share one canvas. Links decide what each agent can reach, and history keeps every turn.",
      download: "Download",
      source: "View source",
    },
    demo: {
      label: "Animated preview of an Asterism session",
      chapters: [
        { title: "Workbench", body: "Agents, files, and tools share one canvas." },
        { title: "Links", body: "A link grants access. Unlinked stays out of reach." },
        { title: "Handoffs", body: "Separate contexts. Work moves along links." },
        { title: "History", body: "Branch from any turn. The old path stays." },
      ],
      ui: {
        sessionTitle: "v0.2 release notes",
        home: "Home",
        conversations: "Conversations",
        folders: "Folders",
        recent: "Recent",
        noFolder: "No folder",
        folderName: "asterism",
        sessions: ["v0.2 release notes", "Plugin loader review", "Terminal resize bug"],
        looseSessions: ["Reading list", "Trip to Kyoto"],
        add: "Add",
        layout: "Layout",
        access: "Access",
        objects: "Objects",
        history: "History",
        menuAgents: "Agents",
        menuResources: "Resources",
        kinds: {
          agent: "Agent",
          directory: "Directory",
          note: "Note",
          terminal: "Terminal",
          web: "Web",
          mcp: "MCP Host",
          pool: "Subagent Pool",
          todo: "Todo List",
          manual: "Manual",
        },
        writer: "Writer",
        reviewer: "Reviewer",
        role: "General",
        noteTitle: "Release brief",
        noteHeading: "v0.2 brief",
        noteLines: ["Lead with link-based access", "One line per change", "Flag breaking changes"],
        placeholder: "Use @ to add references, or press Ctrl+K for commands.",
        saveDraft: "Save draft",
        workingHint: "The agent is working…",
        sessionSource: "Session",
        pause: "Pause demo",
        play: "Play demo",
        emptyConversation: "Send a message to begin.",
        readText: "Read text",
        send: "Send",
        accepted: "Accepted",
        prompt: "Draft the v0.2 release notes from recent changes.",
        reply: "Drafted three sections: Workbench, Agents, and Directory. One line per change.",
        incoming: "Draft is ready. Please check it against CHANGELOG.md.",
        review: "All 14 entries match. Workbench still needs the template search change.",
        followUp: "Keep it to one short paragraph.",
        revised: "Rewrote it as one paragraph covering all three areas.",
        accessTitle: "Resource access",
        byReceiver: "By receiver",
        byResource: "By resource",
        recipient: "Resource receiving access",
        canAccess: "Writer can access",
        linked: "Linked",
        notLinked: "Not linked",
        accessBoundary: "Requests already in progress keep their original access. Subsequent requests use the updated links.",
        main: "Main",
        branch: "Branch 2",
        allRecords: "All records",
        searchHistory: "Find text, tools or resources",
        sessionStart: "Session start",
        you: "You",
        continueHere: "Continue from here",
        branchesHere: "1 branch from here",
      },
    },
    resources: {
      title: "Every capability is an object.",
      body: "Place it on the canvas and link it to the agents that should use it.",
      items: [
        { icon: "bot", kind: "Agent", title: "Writer", meta: "Own context and role" },
        { icon: "folder", kind: "Directory", title: "~/asterism", meta: "Real files on disk" },
        { icon: "file-text", kind: "Note", title: "Release brief", meta: "Shared in the session" },
        { icon: "square-terminal", kind: "Terminal", title: "zsh", meta: "Live shell you share" },
        { icon: "boxes", kind: "Subagent Pool", title: "Research", meta: "Bounded delegation" },
        { icon: "list-todo", kind: "Todo List", title: "Launch", meta: "Tasks across sessions" },
        { icon: "network", kind: "Mesh", title: "Team", meta: "Agents across sessions" },
        { icon: "globe", kind: "Web", title: "Search", meta: "Search and fetch" },
        { icon: "server", kind: "MCP Host", title: "Tools", meta: "MCP tool servers" },
        { icon: "message-square", kind: "Chat", title: "Telegram", meta: "External chats" },
        { icon: "book-open", kind: "Manual", title: "Asterism", meta: "Built-in guides" },
      ],
      plugin: { kind: "Plugin", title: "Yours", meta: "Same public SDK" },
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
        term: "Local storage",
        detail: "Sessions, SQLite history, and settings live on your machine with no Asterism account. Model requests go to your providers, and Sentry crash reporting is opt-in.",
      },
      {
        term: "Your models",
        detail: "Connect Anthropic, OpenAI, or compatible relays directly. Model connections stay separate from reusable agent roles.",
      },
      {
        term: "Open source",
        detail: "MIT licensed. Inspect the host runtime, shared contracts, and built-in plugin in one repository.",
      },
    ],
    download: {
      title: "Download",
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
        body: "macOS builds use a self-signed certificate rather than Apple notarization. After moving Asterism to Applications, clear the quarantine attribute:",
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
    title: "Asterism — 智能体桌面工作台",
    description:
      "在同一张桌面工作台上组织智能体、文件、终端与外部服务。显式链接决定访问边界，会话历史以树状结构完整留存。",
    skipToContent: "跳至正文",
    nav: {
      source: "GitHub",
      switchLabel: "Read in English",
      switchName: "EN",
    },
    hero: {
      lede: "面向智能体的桌面工作台。",
      sublede: "智能体、文件、终端与外部服务同在一张画布上。链接决定各自能触及什么，历史保留每一轮推进。",
      download: "下载应用",
      source: "查看源码",
    },
    demo: {
      label: "Asterism 会话的动画演示",
      chapters: [
        { title: "工作台", body: "智能体、文件与工具同在一张画布。" },
        { title: "链接", body: "连上才能访问，未链接的够不着。" },
        { title: "交接", body: "上下文各自独立，工作沿链接传递。" },
        { title: "历史", body: "从任意一轮分支，原路径完整保留。" },
      ],
      ui: {
        sessionTitle: "v0.2 发布说明",
        home: "首页",
        conversations: "会话",
        folders: "文件夹",
        recent: "最近",
        noFolder: "无文件夹",
        folderName: "asterism",
        sessions: ["v0.2 发布说明", "插件加载审查", "终端尺寸问题"],
        looseSessions: ["阅读清单", "京都行程"],
        add: "添加",
        layout: "布局",
        access: "授权",
        objects: "对象",
        history: "历史",
        menuAgents: "助手",
        menuResources: "资源",
        kinds: {
          agent: "助手",
          directory: "目录",
          note: "笔记",
          terminal: "终端",
          web: "网络检索",
          mcp: "MCP 主机",
          pool: "子代理池",
          todo: "待办清单",
          manual: "手册",
        },
        writer: "撰写者",
        reviewer: "审阅者",
        role: "通用",
        noteTitle: "发布简报",
        noteHeading: "v0.2 简报",
        noteLines: ["先讲基于链接的访问", "每项改动一行", "标出破坏性变更"],
        placeholder: "使用 @ 添加引用，Ctrl+K 打开命令面板。",
        saveDraft: "存入草稿",
        workingHint: "助手正在执行…",
        sessionSource: "会话",
        pause: "暂停演示",
        play: "播放演示",
        emptyConversation: "发送消息开始对话。",
        readText: "读取文本",
        send: "发送消息",
        accepted: "已受理",
        prompt: "根据近期改动起草 v0.2 发布说明。",
        reply: "已起草工作台、助手与目录三个部分，每项改动一行。",
        incoming: "草稿已完成，请对照 CHANGELOG.md 核对。",
        review: "14 条记录均一致。工作台部分还需补上模板搜索。",
        followUp: "压缩成一段简短的文字。",
        revised: "已改写为一段，涵盖三个部分。",
        accessTitle: "资源授权",
        byReceiver: "按接收者",
        byResource: "按资源",
        recipient: "接收访问能力的资源",
        canAccess: "撰写者 可以访问",
        linked: "已链接",
        notLinked: "未链接",
        accessBoundary: "在途请求保持开始时的授权，后续请求取用更新后的链接。",
        main: "主分支",
        branch: "分支 2",
        allRecords: "全部记录",
        searchHistory: "查找文本、工具或资源",
        sessionStart: "会话起点",
        you: "你",
        continueHere: "从此处继续",
        branchesHere: "此处有 1 条分支",
      },
    },
    resources: {
      title: "每项能力都是一个对象。",
      body: "放上画布，再链接给需要它的智能体。",
      items: [
        { icon: "bot", kind: "助手", title: "撰写者", meta: "独立上下文与角色" },
        { icon: "folder", kind: "目录", title: "~/asterism", meta: "磁盘上的真实文件" },
        { icon: "file-text", kind: "笔记", title: "发布简报", meta: "会话内共享" },
        { icon: "square-terminal", kind: "终端", title: "zsh", meta: "与你共用的实时 Shell" },
        { icon: "boxes", kind: "子代理池", title: "调研", meta: "有界委派" },
        { icon: "list-todo", kind: "待办清单", title: "发布", meta: "跨会话的任务" },
        { icon: "network", kind: "助手网络", title: "团队", meta: "跨会话的助手" },
        { icon: "globe", kind: "网络检索", title: "搜索", meta: "检索与抓取" },
        { icon: "server", kind: "MCP 主机", title: "工具", meta: "MCP 工具服务器" },
        { icon: "message-square", kind: "对话", title: "Telegram", meta: "外部聊天" },
        { icon: "book-open", kind: "手册", title: "Asterism", meta: "内置指南" },
      ],
      plugin: { kind: "插件", title: "你的", meta: "同一套公开 SDK" },
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
        term: "数据留在本地",
        detail: "会话、SQLite 历史记录与配置均保存在本机，无需 Asterism 账号。模型请求直连你配置的服务商，Sentry 崩溃报告默认关闭、按需开启。",
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
        body: "macOS 安装包使用自签名证书，未经 Apple 公证。将 Asterism 移入「应用程序」后，可在终端清除隔离属性：",
      },
    },
    footer: {
      author: "dearain.dev",
      releases: "版本发布",
      license: "MIT 许可",
    },
  },
};
