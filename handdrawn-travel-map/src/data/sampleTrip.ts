/**
 * 生产环境（线上预览）自动加载的示例行程
 * 仅用于让预览链接一打开就看到一张铺满标记的手绘地图；
 * 本地开发（dev）不受影响，仍可手输文本走完整链路。
 */
import type { ParseResult } from '@/types/travel'

export const sampleResult: ParseResult = {
  title: '2026 夏日漫游',
  trips: [
    {
      id: 'hangzhou-xihu',
      place: '杭州西湖',
      city: '杭州',
      country: '中国',
      startDate: '2026-07-15',
      endDate: '2026-07-18',
      summary: '苏堤看绝美夕阳',
      story: '在苏堤上看了一场绝美的夕阳，荷叶连天碧，荷花别样红，桨声灯影里慢下了脚步。',
      emoji: '🌊',
      imageQuery: '杭州西湖 苏堤 夕阳',
      tags: ['湖光', '夏日', '悠闲'],
      source: 'sample',
      transport: 'auto', // 起点站，无前置交通
    },
    {
      id: 'chengdu-kuanzhai',
      place: '成都宽窄巷子',
      city: '成都',
      country: '中国',
      startDate: '2026-08-02',
      endDate: '2026-08-05',
      summary: '火锅与熊猫花花',
      story: '在宽窄巷子吃了一顿正宗的牛油火锅，又去大熊猫基地排了很久的队，终于见到了花花。',
      emoji: '🐼',
      imageQuery: '成都 宽窄巷子 火锅',
      tags: ['美食', '烟火', '熊猫'],
      source: 'sample',
      transport: 'plane', // 杭州→成都：飞机
    },
    {
      id: 'kyoto-fushimi',
      place: '伏见稻荷大社',
      city: '京都',
      country: '日本',
      startDate: '2026-09-25',
      endDate: '2026-09-29',
      summary: '千本鸟居漫步',
      story: '清晨的岚山竹林还挂着露水，下午逛了伏见稻荷大社的千本鸟居，朱红一路延伸到山顶。',
      emoji: '⛩️',
      imageQuery: '京都 伏见稻荷大社 千本鸟居',
      tags: ['古都', '红叶', '神社'],
      source: 'sample',
      transport: 'plane', // 成都→京都：飞机
    },
    {
      id: 'hokkaido',
      place: '北海道',
      city: '札幌',
      country: '日本',
      startDate: '2026-10-03',
      endDate: '2026-10-08',
      summary: '层林尽染红叶季',
      story: '正好赶上北海道的红叶季，层林尽染，温泉旅馆窗外就是一片金黄，旅途在此画下句点。',
      emoji: '🍁',
      imageQuery: '北海道 红叶 温泉',
      tags: ['红叶', '温泉', '远方'],
      source: 'sample',
      transport: 'train', // 京都→北海道：新干线/高铁
    },
  ],
}

/** 与示例地点对应的精确坐标（避免依赖外部地理编码服务） */
export const sampleCoords: Record<string, { lat: number; lng: number }> = {
  'hangzhou-xihu': { lat: 30.2595, lng: 120.1496 },
  'chengdu-kuanzhai': { lat: 30.6719, lng: 104.0546 },
  'kyoto-fushimi': { lat: 34.9671, lng: 135.7727 },
  hokkaido: { lat: 43.0642, lng: 141.3469 },
}
