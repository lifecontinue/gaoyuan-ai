/**
 * Mock 解析器 — 用启发式规则从自然语言中抽取行程信息
 * 当后端 /api/parse-trip（DeepSeek）不可用时作为兜底，保证全链路可跑通。
 * 设计目标：尽量完整、准确地抽取用户提到的所有地名。
 */

import type { ParseResult, Trip } from '@/types/travel'

// 月份映射
const MONTH_MAP: Record<string, string> = {
  '一月': '01', '二月': '02', '三月': '03', '四月': '04',
  '五月': '05', '六月': '06', '七月': '07', '八月': '08',
  '九月': '09', '十月': '10', '十一月': '11', '十二月': '12',
  '1月': '01', '2月': '02', '3月': '03', '4月': '04',
  '5月': '05', '6月': '06', '7月': '07', '8月': '08',
  '9月': '09', '10月': '10', '11月': '11', '12月': '12',
}

// 年份提取
function extractYear(text: string): number {
  const yearMatch = text.match(/(\d{4})年?/)
  if (yearMatch) return parseInt(yearMatch[1])
  if (/今年|这年/.test(text)) return new Date().getFullYear()
  if (/去年/.test(text)) return new Date().getFullYear() - 1
  return new Date().getFullYear()
}

// 地点 emoji 映射（启发式）
const PLACE_EMOJI: Record<string, string> = {
  '西湖': '🏞️', '湖': '🌊',
  '宽窄巷子': '🏮', '巷子': '🏮', '火锅': '🍲',
  '京都': '⛩️', '竹林': '🎋', '稻荷': '🧡', '鸟居': '🧡',
  '北海道': '🍁', '红叶': '🍁', '枫': '🍁',
  '熊猫': '🐼', '大熊猫': '🐼',
  '长城': '🏯', '故宫': '🏯', '天安门': '🏛️',
  '外滩': '🌃', '东方明珠': '🗼',
  '塔': '🗼', '寺': '⛩️', '庙': '🏛️',
  '山': '⛰️', '海': '🌊', '岛': '🏝️',
  '沙漠': '🏜️', '草原': '🌾',
}

function getPlaceEmoji(place: string): string {
  for (const [key, emoji] of Object.entries(PLACE_EMOJI)) {
    if (place.includes(key)) return emoji
  }
  return '📍'
}

// 非地名停用词（食物 / 时间 / 人称 / 连接词 / 交通工具）
const STOPWORDS = new Set([
  '火锅', '小吃', '美食', '大餐', '午饭', '晚饭', '早餐', '午餐', '晚餐',
  '面条', '拉面', '烤鸭', '寿司', '咖啡', '奶茶', '啤酒', '烧烤', '零食',
  '今天', '昨天', '前天', '明天', '今年', '去年', '我们', '你们', '他们',
  '大家', '时候', '晚上', '下午', '上午', '早上', '中午', '凌晨', '那天',
  '这里', '那里', '这儿', '那儿', '然后', '接着', '最后', '首先', '但是',
  '可是', '因为', '所以', '如果', '虽然', '朋友', '家人', '导游',
  // 行程类活动词（避免「去上海出差」把出差当成地名）
  '旅游', '旅行', '出差', '度假', '探亲', '留学', '开会', '办事',
  '工作', '学习', '游玩', '观光', '闲逛', '溜达',
  // 泛指场所 / 看·赏的宾语（避免 在学校 / 逛了操场 / 看日出 误当景点）
  '学校', '操场', '教室', '食堂', '卧室', '客厅', '厨房', '厕所', '卫生间',
  '办公室', '会议室', '宿舍', '大熊猫',
  '日出', '日落', '夕阳', '晚霞', '星星', '烟花', '演出', '表演',
  '比赛', '电影', '风景', '美景', '夜景', '大海',
  // 交通工具（避免「坐高铁到苏州」把高铁当成地点）
  '高铁', '火车', '动车', '飞机', '航班', '大巴', '客车', '轮船', '游轮',
  '邮轮', '渡轮', '地铁', '自驾', '汽车', '出租车', '网约车',
])

// 连词（用于拆分「A和B」「A、B」）—— 不用 g 标志，避免 .test() 的 lastIndex 状态导致漏判
const CONJ_RE = /[、，,与和及]/

// 地名后缀（出现这些字，前面大概率是地名）
const PLACE_SUFFIX = [
  '省', '市', '县', '区', '镇', '乡', '村', '社区', '街道',
  '山', '峰', '岭', '坡', '谷', '峡', '岛', '屿', '半岛', '湖', '河', '江', '溪', '泉', '瀑', '池',
  '海', '湾', '港', '口岸', '渡口', '滩',
  '寺', '庙', '宫', '殿', '塔', '楼', '阁', '桥', '亭', '坊', '院', '居', '祠', '庵',
  '园', '公园', '花园', '陵园', '景区', '名胜', '古城', '古镇', '古村', '城堡', '城墙', '关', '长城',
  '广场', '街', '路', '道', '巷', '胡同', '大道',
  '大学', '学院', '学校', '博物馆', '美术馆', '图书馆', '剧院', '影院', '体育馆',
  '基地', '大厦', '中心', '商场', '市场', '车站', '机场', '码头',
  '林', '草原', '沙漠', '雪山', '冰川', '原', '场', '城', '都', '州', '京', '阪', '道', '社', '鸟居', '堤', '坡',
  '温泉', '湿地', '乐园', '洞', '岩', '洲', '寨', '栈道', '梯田', '茶园', '教堂',
]

// 动词（出现在动词之后的才是「地点」，遇到动词即停止捕获）
const MOTION_VERB = '在(?:了)?|去(?!年|月|日)(?:了)?|到(?:了)?|来(?:了)?|回(?:了)?|飞(?:到|往|去)?|坐(?:了)?|乘(?:了)?|搭(?:了)?|前往|抵达|入住|路过|途经|奔向|杀到|杀去|转战|于(?:了)?|奔|往(?:了)?|赴(?:了)?|赶到|直奔|自驾到|打车到'
const VISIT_VERB = '逛(?:了)?|游(?:了)?|游览|参观|打卡|爬(?:了)?|登(?:了)?|拍(?:了)?|探访|走访|漫步|散步|溜达(?:了)?|闲逛(?:了)?|转悠(?:了)?|观光(?:了)?|游玩(?:了)?|看(?:了)?'
const FOOD_VERB = '吃(?:了)?|尝(?:了)?|喝(?:了)?'
const FOOD_VENUE = '餐厅|饭店|酒楼|馆子|食堂|店|坊|阁|院|屋|舍|庄'

// 捕获时的「停止符」：遇到这些字符说明已经超出地名范围（数字保留以排除纯数字）
const STOP = '去|到|在|来|回|飞|坐|乘|搭|逛|游|览|参|观|打|卡|玩|住|看|赏|散|步|爬|登|拍|探|访|又|还|并|再|就|也|接|然|之|了|的|，|,|。|！|？|；|往|赴|[0-9]'
// 地名捕获 token（捕获组）
const TOKEN = `((?:(?!${STOP})[\\u4e00-\\u9fffA-Za-z·．.\\u3000-\\u303f\\uff00-\\uffef]){2,12})`

/** 清洗抽取到的候选地名，返回 null 表示应丢弃 */
function cleanPlace(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()
  // 去掉开头冗余（+：连续剥掉 了/趟 等多层前缀，如「了趟日本京都」→「日本京都」）
  s = s.replace(/^(?:了|的|是|有|去|到|在|从|和|与|跟|带|一家|一座|一个|一条|一间|一趟|趟|次)+/, '')
  // 去掉国家前缀（日本京都→京都；单独的「日本」→保留）
  s = s.replace(/^(?:日本|中国|美国|英国|法国|德国|韩国|泰国|新加坡|意大利|西班牙|澳大利亚|加拿大|新西兰)(?=[\u4e00-\u9fff]{2,})/, '')
  // 去掉结尾冗余
  s = s.replace(/(?:了|的|里|上|中|内|边|附近|旁边|之后|以前|以后|时候|期间|当天|当日|那里|那儿|这里|这儿)$/, '')
  // 遇到描述性动词 / 连接词 / 活动词即截断（如「西湖边骑行」→「西湖」、「去上海出差」→「上海」）
  s = s.replace(/(?:旅游|旅行|出差|度假|开会|探亲|留学|办事|工作|学习|游玩|观光|闲逛|溜达|接着|然后|之后|参观|打卡|看|吃|玩|住|赏|逛|游|拍|坐|乘|回|走|奔|转|又|还|并|再|就|也|的|了|，|,|。|！|？|；|边|旁|侧|骑|行|散|步|爬|登).*$/, '')
  // 去掉「的XXX」尾缀（如「伏见稻荷大社的千本鸟居」→「伏见稻荷大社」）
  s = s.replace(/的.*$/, '')
  // 去标点 / 空白
  s = s.replace(/[，。！？、；：""''（）()\s]/g, '')
  if (s.length < 2) return null
  if (STOPWORDS.has(s)) return null
  // 量词短语（一场/一顿/一次）大概率不是地名
  if (/^(?:一场|一顿|一次|一趟|一下|一会儿|一番|一点|一些)/.test(s)) return null
  // 叠字昵称（花花 / 毛毛）大概率不是地名
  if (/^(.)\1$/.test(s)) return null
  if (/^[\d年月日号初末中上下旬]+$/.test(s)) return null
  return s
}

/** 从单句抽取所有地名（按出现顺序） */
function extractPlaces(sentence: string): string[] {
  const found = new Map<number, string>()

  const add = (name: string | null) => {
    if (!name) return
    const pos = sentence.indexOf(name)
    if (pos < 0) return
    const existing = found.get(pos)
    if (!existing || name.length > existing.length) found.set(pos, name)
  }

  let m: RegExpExecArray | null

  // A) 移动 / 到达类动词 → 地名
  const motionRe = new RegExp(`(?:${MOTION_VERB})\\s*${TOKEN}`, 'g')
  while ((m = motionRe.exec(sentence))) add(cleanPlace(m[1]))

  // B) 游览 / 参观类动词 → 地名（景点）
  const visitRe = new RegExp(`(?:${VISIT_VERB})\\s*${TOKEN}`, 'g')
  while ((m = visitRe.exec(sentence))) add(cleanPlace(m[1]))

  // C) 食物动词 → 仅当宾语是「餐厅 / 饭店」等场所
  const foodRe = new RegExp(`(?:${FOOD_VERB})\\s*([\\u4e00-\\u9fffA-Za-z·]{2,12}?)(?:${FOOD_VENUE})`, 'g')
  while ((m = foodRe.exec(sentence))) add(cleanPlace(m[1] + (m[2] || '')))

  // D) 从 X 到 / 至 Y
  const fromToRe = new RegExp(`从\\s*${TOKEN}\\s*(?:到|至|去)\\s*${TOKEN}`, 'g')
  while ((m = fromToRe.exec(sentence))) {
    add(cleanPlace(m[1]))
    add(cleanPlace(m[2]))
  }

  // E) 地名后缀扫描（西湖 / 北海道 / 岚山 / 京都 / 苏堤 / 伏见稻荷大社 ...）
  //    起点限定在句首或 了/和/跟/带/标点 等边界，避免从任意汉字中间起词导致整句被吞
  const suffixRe = new RegExp(
    `(?:^|[，。！？；、了和与跟带「」（）()])(?:(?!${STOP})[\\u4e00-\\u9fff·]){1,6}(${PLACE_SUFFIX.join('|')})`,
    'g',
  )
  while ((m = suffixRe.exec(sentence))) add(cleanPlace(m[0]))

  // E2) 所属结构「X的Y」：捕捉 千本鸟居 / 大熊猫基地 / 埃菲尔铁塔 这类「景点名」，
  //     限定「的」后至少 2 个汉字再接后缀，避免把 操场/钟楼 这类泛指名词误当地名
  const possRe = new RegExp(
    `的\\s*((?:(?!${STOP})[\\u4e00-\\u9fff·]){2,8}(?:${PLACE_SUFFIX.join('|')}))`,
    'g',
  )
  while ((m = possRe.exec(sentence))) add(cleanPlace(m[1]))

  // F) 连词拆分（「A和B」「A、B、C」）
  const expanded: { pos: number; name: string }[] = []
  for (const [pos, name] of found) {
    if (CONJ_RE.test(name)) {
      const parts = name.split(CONJ_RE)
      parts.forEach((p, i) => {
        const n = cleanPlace(p)
        if (n) expanded.push({ pos: pos + i * 2, name: n })
      })
    } else {
      expanded.push({ pos, name })
    }
  }

  return expanded
    .filter((c) => c.name && !STOPWORDS.has(c.name))
    .sort((a, b) => a.pos - b.pos)
    .map((c) => c.name)
}

/**
 * 主解析函数
 */
export function mockParser(text: string): ParseResult {
  const year = extractYear(text)
  const trips: Trip[] = []
  const seen = new Set<string>() // place@month 去重，允许同地点不同月份

  const sentences = text
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  let currentMonth = ''

  for (const sentence of sentences) {
    const monthMatch = sentence.match(/(\d+|[一二三四五六七八九十]+)月/)
    if (monthMatch) {
      const mm = monthMatch[1]
      currentMonth = MONTH_MAP[mm] || mm.padStart(2, '0')
    }

    let dayOffset = '01'
    if (/初/.test(sentence)) dayOffset = '05'
    else if (/中旬|中/.test(sentence)) dayOffset = '15'
    else if (/末|底/.test(sentence)) dayOffset = '25'
    else {
      const dm = sentence.match(/(\d{1,2})\s*[日号]/)
      if (dm) dayOffset = parseInt(dm[1]).toString().padStart(2, '0')
    }

    const month = currentMonth || '01'
    const startDate = `${year}-${month}-${dayOffset}`

    const places = extractPlaces(sentence)
    for (const place of places) {
      const key = `${place}@${month}`
      if (seen.has(key)) continue
      seen.add(key)

      const idx = sentence.indexOf(place)
      let story = sentence.slice(idx + place.length)
      story = story.replace(/^[，、。\s]+/, '')
      story = (story.split(/[，。！？；、]/)[0] || '').trim()

      trips.push({
        id: slugify(`${place}-${startDate}`),
        place,
        city: inferCity(place),
        country: inferCountry(place),
        startDate,
        summary: generateSummary(place, startDate),
        story: story || `在${place}留下了难忘的回忆`,
        emoji: getPlaceEmoji(place),
        imageQuery: place,
      })
    }
  }

  // 全局按地名去重（防止跨句重复）
  const finalSeen = new Set<string>()
  const unique = trips.filter((t) => {
    if (finalSeen.has(t.place)) return false
    finalSeen.add(t.place)
    return true
  })

  return {
    title: inferTitle(text, year),
    trips: unique,
  }
}

/** 生成 URL-safe slug */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
}

/** 推断城市名 */
function inferCity(place: string): string | undefined {
  const knownCities = [
    '杭州', '成都', '北京', '上海', '广州', '深圳', '西安', '重庆',
    '南京', '苏州', '厦门', '大理', '丽江', '拉萨', '东京', '大阪',
    '京都', '札幌', '曼谷', '新加坡', '巴黎', '伦敦', '纽约', '台北',
  ]
  for (const city of knownCities) {
    if (place.includes(city)) return city
  }
  return undefined
}

/** 推断国家/地区 */
function inferCountry(place: string): string | undefined {
  if (/日本|京都|大阪|东京|北海道|札幌|伏见|稻荷|岚山/.test(place)) return '日本'
  if (/泰国|曼谷|清迈|普吉/.test(place)) return '泰国'
  if (/新加坡/.test(place)) return '新加坡'
  if (/法国|巴黎|埃菲尔/.test(place)) return '法国'
  if (/英国|伦敦|大本钟/.test(place)) return '英国'
  if (/美国|纽约|旧金山|洛杉矶/.test(place)) return '美国'
  if (/韩国|首尔|釜山/.test(place)) return '韩国'
  if (/中国|北京|上海|杭州|成都|西安|重庆|南京|苏州|厦门|大理|丽江|拉萨|广州|深圳/.test(place)) return '中国'
  return '中国'
}

/** 生成摘要 */
function generateSummary(place: string, date: string): string {
  const month = date.slice(5, 7)
  return `${parseInt(month)}月·${place}`
}

/** 推断标题 */
function inferTitle(text: string, year: number): string {
  const months: number[] = []
  const monthMatches = text.matchAll(/(\d+|[一二三四五六七八九十]+)月/g)
  for (const mm of monthMatches) {
    const raw = MONTH_MAP[mm[1]] ?? mm[1]
    const num = parseInt(raw)
    if (!isNaN(num)) months.push(num)
  }

  if (months.length >= 2) {
    const sorted = [...new Set(months)].sort((a, b) => a - b)
    return `${year}年旅行足迹 · ${sorted.length}个目的地`
  }

  return `${year}年我的旅行地图`
}
