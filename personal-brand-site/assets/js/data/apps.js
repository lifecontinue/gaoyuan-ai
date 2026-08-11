// data/apps.js — app catalogue (the main extension point)
// To add an app: append one object to this array. No HTML/CSS/JS changes needed.
// placements[].x / y  = hotspot centre (percentage of the room image, 0–100).
// placements[].lx / ly = anchor for the app name label (line end, label bottom-centre).
// placements[].shape  = irregular object outline: an array of percentage points forming a closed polygon.
// Open the page with ?calibrate=1 to click-pick coordinates and copy them to the clipboard.
//
// The entries below are all live products (links come from the WorkBuddy publish settings).
// 展示文案以中文为主，en 字段保留已上线产品的英文原名（用作小字副标题）。

export const apps = [
  {
    id: "tank-wars",
    name: "坦克大战",
    en: "Tank Wars",
    desc: "更大的地图、分层 3D 地形与 QWER 技能战斗，搭配可交互的商店系统。三种坦克——均衡、重装、迅猛——靠近建筑即可触发商店、加油站与银行。",
    tagline: "立体战场 · 实时技能对战",
    icon: null,
    screenshot: "assets/img/screenshots/tank-wars.png",
    url: "/tank-wars/",
    tags: ["游戏", "实时对战", "3D 地形"],
    status: "live",
    placements: [{
      room: "study",
      x: 24, y: 33,        // robot / tank cluster centre
      lx: 24, ly: 33,      // label centred above the object
      label: "坦克大战",
      anchor: "top",
      // Irregular outline of the robot/tank cluster on the upper shelf (percentage coords)
      shape: [
        { x: 13, y: 25 }, { x: 19, y: 22 }, { x: 27, y: 23 },
        { x: 34, y: 27 }, { x: 37, y: 33 }, { x: 35, y: 40 },
        { x: 27, y: 43 }, { x: 18, y: 42 }, { x: 12, y: 36 }
      ]
    }]
  },
  {
    id: "travel-map",
    name: "旅行故事地图",
    en: "Trails · Travel Story Map",
    desc: "把一次旅行变成可漫游的故事地图：从杭州西湖的日落，到北海道的雪国——四个站点、手绘路线与沉浸式风景。",
    tagline: "把旅行变成可漫游的故事地图",
    icon: null,
    screenshot: "assets/img/screenshots/travel-map.png",
    url: "https://travel-map.gaoyuan-ai.xyz",
    tags: ["旅行", "故事地图", "手绘"],
    status: "live",
    placements: [{
      room: "study",
      x: 11, y: 57,        // globe + travel journal / tablet centre
      lx: 11, ly: 57,      // label centred above the object
      label: "旅行地图",
      anchor: "top",
      // Outline of the globe + travel journal + scenery tablet
      shape: [
        { x: 2, y: 49 }, { x: 6, y: 43 }, { x: 11, y: 44 },
        { x: 17, y: 48 }, { x: 25, y: 51 }, { x: 28, y: 58 },
        { x: 26, y: 65 }, { x: 20, y: 69 }, { x: 11, y: 68 },
        { x: 4, y: 64 }, { x: 1, y: 55 }
      ]
    }]
  },
  {
    id: "growth-stars",
    name: "成长星图",
    en: "Growth Starfield",
    desc: "面向幼儿园阶段的六维成长记录，把评估变成一片可以点亮的星空——每一次小小的进步，都是一颗亮起的星。",
    tagline: "点亮孩子的每一步成长",
    icon: null,
    screenshot: "assets/img/screenshots/growth-stars.png",
    url: "https://growth-stars.gaoyuan-ai.xyz",
    tags: ["育儿", "成长记录", "数据可视化"],
    status: "live",
    placements: [{
      room: "study",
      x: 48, y: 72,        // assessment cards / paper on the desk
      lx: 48, ly: 72,      // label centred above the object
      label: "成长星图",
      anchor: "top",
      // Outline of the assessment cards / paper at the centre of the desk
      shape: [
        { x: 40, y: 62 }, { x: 47, y: 60 }, { x: 54, y: 61 },
        { x: 59, y: 66 }, { x: 58, y: 73 }, { x: 53, y: 78 },
        { x: 45, y: 78 }, { x: 39, y: 74 },       { x: 38, y: 67 }
      ]
    }]
  },
  {
    id: "child-assessment",
    name: "儿童成长评估",
    en: "Child Growth Assessment",
    desc: "一套围绕儿童发展阶段构建的评估系统。它量化每一个维度的成长并生成可视化报告，让家长真正看见孩子每一步的前进。",
    tagline: "看见孩子成长的每一步",
    icon: null,
    screenshot: "assets/img/screenshots/child-assessment-system.png",
    url: "https://child-assessment.gaoyuan-ai.xyz",
    tags: ["育儿", "评估", "数据可视化"],
    status: "live",
    placements: [{
      room: "study",
      x: 80, y: 30,        // upper-right storage / screen area
      lx: 80, ly: 30,      // label centred above the object
      label: "成长评估",
      anchor: "top",
      shape: [
        { x: 72, y: 24 }, { x: 80, y: 22 }, { x: 88, y: 25 },
        { x: 90, y: 32 }, { x: 86, y: 37 }, { x: 78, y: 37 }, { x: 72, y: 33 }
      ]
    }]
  },
  {
    id: "poop-tracker",
    name: "宝宝便便记录",
    en: "Baby Poop Tracker",
    desc: "按时间段与形态记录宝宝每日的排便情况，帮助家长读懂健康节律——把育儿中的琐碎小事，变成可用的数据。",
    tagline: "把育儿的小瞬间变成数据",
    icon: null,
    screenshot: "assets/img/screenshots/poop-tracker-three.png",
    url: "/poop-tracker/",
    tags: ["育儿", "健康记录", "小工具"],
    status: "live",
    placements: [{
      room: "study",
      x: 85, y: 68,        // lower-right area
      lx: 85, ly: 68,      // label centred above the object
      label: "便便记录",
      anchor: "top",
      shape: [
        { x: 77, y: 62 }, { x: 85, y: 60 }, { x: 93, y: 63 },
        { x: 95, y: 70 }, { x: 91, y: 75 }, { x: 83, y: 75 }, { x: 77, y: 71 }
      ]
    }]
  },
  {
    id: "pm-growth-os",
    name: "PM 成长操作系统",
    en: "PM Growth OS",
    desc: "一套面向产品经理的成长操作系统。它把方法论、目标与复盘沉淀为个人能力地图，支撑持续的自进化。",
    tagline: "产品经理的自进化系统",
    icon: null,
    screenshot: "assets/img/screenshots/pm-growth-os.png",
    url: "/pm-growth-os/",
    tags: ["产品管理", "成长", "方法论"],
    status: "live",
    placements: [{
      room: "study",
      x: 75, y: 52,        // centre-right area
      lx: 75, ly: 52,      // label centred above the object
      label: "PM 成长 OS",
      anchor: "top",
      shape: [
        { x: 67, y: 46 }, { x: 75, y: 44 }, { x: 83, y: 47 },
        { x: 85, y: 54 }, { x: 81, y: 59 }, { x: 73, y: 59 }, { x: 67, y: 55 }
      ]
    }]
  },
  {
    id: "neck-soccer",
    name: "颈部足球",
    en: "Neck Soccer",
    desc: "一款体感控制的小足球游戏：歪一歪头就能操控球、躲避障碍、射门得分。把一次短暂的屏幕休息，变成轻量的颈肩锻炼。",
    tagline: "歪一歪头，带球过人",
    icon: null,
    screenshot: "assets/img/screenshots/neck-soccer.png",
    url: "https://neck-soccer.gaoyuan-ai.xyz",
    tags: ["游戏", "体感控制", "健身"],
    status: "live",
    placements: [{
      room: "study",
      x: 52, y: 31,
      lx: 52, ly: 31,
      label: "颈部足球",
      anchor: "top",
      shape: [
        { x: 44, y: 24 }, { x: 52, y: 22 }, { x: 60, y: 24 },
        { x: 63, y: 31 }, { x: 60, y: 38 }, { x: 52, y: 40 },
        { x: 44, y: 38 }, { x: 41, y: 31 }
      ]
    }]
  },
  {
    id: "breathe",
    name: "呼吸",
    en: "Breathe",
    desc: "一款引导式的呼吸与放松陪伴应用。可视化节奏、可调的呼吸模式与温柔的提醒，帮你降低压力、提升专注——忙碌日子里随身携带的冷静教练。",
    tagline: "用引导式呼吸减压、提神",
    icon: null,
    screenshot: "assets/img/screenshots/breathing-trainer.png",
    url: "https://breathe.gaoyuan-ai.xyz",
    tags: ["健康", "身心", "正念"],
    status: "live",
    placements: [{
      room: "study",
      x: 53, y: 50,
      lx: 53, ly: 50,
      label: "呼吸",
      anchor: "top",
      shape: [
        { x: 45, y: 44 }, { x: 52, y: 42 }, { x: 60, y: 44 },
        { x: 63, y: 50 }, { x: 60, y: 56 }, { x: 52, y: 58 },
        { x: 45, y: 56 }, { x: 42, y: 50 }
      ]
    }]
  },
  {
    id: "fret-flow",
    name: "FRET FLOW 吉他陪练",
    en: "FRET FLOW",
    desc: "一款 AI 音乐陪练工具：实时音高 / 和弦 / 节奏检测，跟随乐谱逐小节给出 perfect / good / early / late / miss 反馈，把练琴变成带即时教练的可视化练习。",
    tagline: "实时反馈 · AI 吉他/钢琴陪练",
    icon: null,
    screenshot: null,
    url: "/practice/",
    tags: ["音乐", "实时反馈", "AI 陪练"],
    status: "live"
  }
];
