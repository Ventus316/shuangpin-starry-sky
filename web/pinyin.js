// 小鶴雙拼資料：聲母鍵、韻母鍵、零聲母打法、合法音節表（依拼寫，ü 寫作 v）
"use strict";

const INITIAL_KEYS = {
  b: "b", p: "p", m: "m", f: "f", d: "d", t: "t", n: "n", l: "l",
  g: "g", k: "k", h: "h", j: "j", q: "q", x: "x", r: "r", z: "z",
  c: "c", s: "s", y: "y", w: "w", v: "zh", i: "ch", u: "sh",
};

// 韻母鍵（跟你登錄檔裡的小鶴方案一致）
const FINAL_KEYS = {
  q: ["iu"], w: ["ei"], e: ["e"], r: ["uan"], t: ["ue", "ve"], y: ["un"],
  u: ["u"], i: ["i"], o: ["uo", "o"], p: ["ie"], a: ["a"], s: ["iong", "ong"],
  d: ["ai"], f: ["en"], g: ["eng"], h: ["ang"], j: ["an"], k: ["ing", "uai"],
  l: ["iang", "uang"], z: ["ou"], x: ["ia", "ua"], c: ["ao"], v: ["v", "ui"],
  b: ["in"], n: ["iao"], m: ["ian"],
};

// 零聲母：第一鍵是韻母首字母，第二鍵如下
const ZERO = {
  a: { a: "a", i: "ai", n: "an", h: "ang", o: "ao" },
  o: { o: "o", u: "ou" },
  e: { e: "e", i: "ei", n: "en", g: "eng", r: "er" },
};

const SYLLABLE_TEXT = `
ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu
pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu
ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu
fa fo fei fou fan fen fang feng fu
da de dai dei dao dou dan den dang deng dong di dia die diao diu dian ding du duo dui duan dun
ta te tai tei tao tou tan tang teng tong ti tie tiao tian ting tu tuo tui tuan tun
na ne nai nei nao nou nan nen nang neng nong ni nie niao niu nian nin niang ning nu nuo nuan nv nve
la lo le lai lei lao lou lan lang leng long li lia lie liao liu lian lin liang ling lu luo luan lun lv lve
ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang
ka ke kai kei kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang
ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang
ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun
qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun
xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun
zha zhe zhi zhai zhei zhao zhou zhan zhen zhang zheng zhong zhu zhua zhuo zhuai zhui zhuan zhun zhuang
cha che chi chai chao chou chan chen chang cheng chong chu chua chuo chuai chui chuan chun chuang
sha she shi shai shei shao shou shan shen shang sheng shu shua shuo shuai shui shuan shun shuang
re ri rao rou ran ren rang reng rong ru rua ruo rui ruan run
za ze zi zai zei zao zou zan zen zang zeng zong zu zuo zui zuan zun
ca ce ci cai cao cou can cen cang ceng cong cu cuo cui cuan cun
sa se si sai sao sou san sen sang seng song su suo sui suan sun
ya yo ye yao you yan yin yang ying yong yi yu yue yuan yun
wa wo wai wei wan wen wang weng wu
`;
const SYLLABLES = new Set(SYLLABLE_TEXT.trim().split(/\s+/));

const show = (s) => s.replace(/v/g, "ü");

/** 聲母鍵（或零聲母 a/o/e）+ 韻母鍵 → 音節，不合法回傳 null */
function combine(first, second) {
  if (ZERO[first]) return ZERO[first][second] || null;
  const ini = INITIAL_KEYS[first];
  if (!ini) return null;
  for (const fin of FINAL_KEYS[second] || []) {
    const syl = ini + fin;
    if (SYLLABLES.has(syl)) return syl;
  }
  return null;
}

/** 按了第一鍵：右邊列出能接的第二鍵 */
function followers(first) {
  const out = [];
  for (const k of "qwertyuiopasdfghjklzxcvbnm") {
    const syl = combine(first, k);
    if (syl) out.push({ key: k, syl });
  }
  return out;
}

/** 按了第二鍵：左邊列出能接在前面的第一鍵 */
function leaders(second) {
  const out = [];
  for (const k of "qwertyuiopasdfghjklzxcvbnm") {
    const syl = combine(k, second);
    if (syl) out.push({ key: k, syl });
  }
  return out;
}

/** 第一鍵代表的聲母文字 */
function firstLabel(first) {
  if (ZERO[first]) return first;
  return INITIAL_KEYS[first] || first;
}

// ---------- 注音 ----------
const INI_ZY = {
  b: "ㄅ", p: "ㄆ", m: "ㄇ", f: "ㄈ", d: "ㄉ", t: "ㄊ", n: "ㄋ", l: "ㄌ",
  g: "ㄍ", k: "ㄎ", h: "ㄏ", j: "ㄐ", q: "ㄑ", x: "ㄒ", zh: "ㄓ", ch: "ㄔ", sh: "ㄕ",
  r: "ㄖ", z: "ㄗ", c: "ㄘ", s: "ㄙ", y: "ㄧ", w: "ㄨ",
};
const FIN_ZY = {
  a: "ㄚ", o: "ㄛ", e: "ㄜ", ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ", an: "ㄢ", en: "ㄣ",
  ang: "ㄤ", eng: "ㄥ", er: "ㄦ", ong: "ㄨㄥ", i: "ㄧ", ia: "ㄧㄚ", ie: "ㄧㄝ", iao: "ㄧㄠ",
  iu: "ㄧㄡ", ian: "ㄧㄢ", in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ", u: "ㄨ",
  ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", ui: "ㄨㄟ", uan: "ㄨㄢ", un: "ㄨㄣ", uang: "ㄨㄤ",
  v: "ㄩ", ve: "ㄩㄝ", van: "ㄩㄢ", vn: "ㄩㄣ",
};
const YW_ZY = {
  yi: "ㄧ", ya: "ㄧㄚ", yo: "ㄧㄛ", ye: "ㄧㄝ", yao: "ㄧㄠ", you: "ㄧㄡ", yan: "ㄧㄢ", yin: "ㄧㄣ",
  yang: "ㄧㄤ", ying: "ㄧㄥ", yong: "ㄩㄥ", yu: "ㄩ", yue: "ㄩㄝ", yuan: "ㄩㄢ", yun: "ㄩㄣ",
  wu: "ㄨ", wa: "ㄨㄚ", wo: "ㄨㄛ", wai: "ㄨㄞ", wei: "ㄨㄟ", wan: "ㄨㄢ", wen: "ㄨㄣ",
  wang: "ㄨㄤ", weng: "ㄨㄥ",
};

/** 拼音音節（ü 寫作 v）→ 注音 */
function zhuyin(syl) {
  if (YW_ZY[syl]) return YW_ZY[syl];
  const ini = ["zh", "ch", "sh"].find((s) => syl.startsWith(s)) ||
    (INI_ZY[syl[0]] && !"aoe".includes(syl[0]) ? syl[0] : "");
  let fin = syl.slice(ini.length);
  if (!ini) return FIN_ZY[fin] || "";
  if ("zh ch sh r z c s".split(" ").includes(ini) && fin === "i") return INI_ZY[ini];
  if ("jqx".includes(ini) && fin.startsWith("u")) fin = "v" + fin.slice(1);
  return INI_ZY[ini] + (FIN_ZY[fin] || "?");
}

// 鍵盤上每個鍵的韻母標示：[拼音, 注音]
const FINAL_LABELS = {
  q: [["iu", "ㄧㄡ"]], w: [["ei", "ㄟ"]], e: [["e", "ㄜ"]],
  r: [["uan", "ㄨㄢ"], ["", "ㄩㄢ"]], t: [["üe", "ㄩㄝ"]], y: [["un", "ㄨㄣ"], ["", "ㄩㄣ"]],
  u: [["u", "ㄨ"], ["", "ㄩ"]], i: [["i", "ㄧ"]], o: [["o", "ㄛ"], ["uo", "ㄨㄛ"]], p: [["ie", "ㄧㄝ"]],
  a: [["a", "ㄚ"]], s: [["iong", "ㄩㄥ"], ["ong", "ㄨㄥ"]], d: [["ai", "ㄞ"]], f: [["en", "ㄣ"]],
  g: [["eng", "ㄥ"]], h: [["ang", "ㄤ"]], j: [["an", "ㄢ"]], k: [["ing", "ㄧㄥ"], ["uai", "ㄨㄞ"]],
  l: [["iang", "ㄧㄤ"], ["uang", "ㄨㄤ"]], z: [["ou", "ㄡ"]], x: [["ia", "ㄧㄚ"], ["ua", "ㄨㄚ"]],
  c: [["ao", "ㄠ"]], v: [["ui", "ㄨㄟ"], ["ü", "ㄩ"]], b: [["in", "ㄧㄣ"]], n: [["iao", "ㄧㄠ"]],
  m: [["ian", "ㄧㄢ"]],
};

// 零聲母打法：[音節, 按鍵]
const ZERO_LIST = [
  ["a", "aa"], ["ai", "ai"], ["an", "an"], ["ang", "ah"], ["ao", "ao"],
  ["e", "ee"], ["ei", "ei"], ["en", "en"], ["eng", "eg"], ["er", "er"],
  ["o", "oo"], ["ou", "ou"],
];

/** 第一鍵代表的聲母注音 */
function firstZhuyin(first) {
  if (ZERO[first]) return FIN_ZY[first];
  return INI_ZY[INITIAL_KEYS[first]] || "";
}

window.Pinyin = {
  combine, followers, leaders, firstLabel, firstZhuyin, show, zhuyin,
  INITIAL_KEYS, FINAL_KEYS, FINAL_LABELS, INI_ZY, ZERO_LIST, SYLLABLES,
};
