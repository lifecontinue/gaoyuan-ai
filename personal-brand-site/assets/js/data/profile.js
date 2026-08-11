// data/profile.js — personal info / contact details / QR codes

export const profile = {
  name: "Yuan Gao",
  nameEn: "",
  title: "AI Product Manager",
  titleAlt: "AI Product Manager / Product Architect",
  // 紧凑分段版本：渲染时经 innerHTML 输出，<br/> 控制换行
  motto: "Building AI products with warmth.<br/>Somewhere between tooling efficiency<br/>and human experience.",
  summary:
    "From LLM productisation, RAG and multimodal AI to RPA + LLM and human-in-the-loop, I keep pushing AI from tool-shaped features toward an always-present, companion-like assistant.",
  contacts: {
    // 公众号二维码（已有文件，保留用作第一个 QR）
    publicAccountQR: "assets/img/qrcode.png",
    publicAccountLabel: {
      en: "Official Account",
      zh: "公众号"
    },
    // 个人微信二维码（用户上传的 jpg）
    personalWechatQR: "assets/img/wechat-qrcode.jpg",
    personalWechatLabel: {
      en: "Personal WeChat",
      zh: "个人微信"
    },
    // 二维码区下方的引导文案（可选）
    qrHint: "Scan to add me as a friend or follow my writing.",
    // Email 仅保留一种联系方式
    email: "haidagy@gmail.com"
    // ⚠️ Phone 与 LinkedIn 已按用户要求移除
  },
  // Ambient audio removed (no Sound button requested)
  ambient: ""
};
