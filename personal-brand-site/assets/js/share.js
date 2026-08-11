// share.js — 分享：优先 Web Share API，否则复制链接并 toast
import { showToast } from "./utils.js";

export async function shareSite() {
  const data = {
    title: document.title,
    text: "Take a look at my app workshop",
    url: location.href
  };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (_) {
      /* 用户取消，回退复制 */
    }
  }
  try {
    await navigator.clipboard.writeText(location.href);
    showToast("Link copied");
  } catch (_) {
    showToast("Copy failed — please copy it manually");
  }
}
