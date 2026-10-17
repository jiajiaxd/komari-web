// 登录监控可信属地选项，代码为 ISO 3166-2（国家-子区域），与服务端 login_allowed_regions 对应。
export interface RegionOption {
  code: string;
  zh: string;
  en: string;
}

export const CN_PROVINCES: RegionOption[] = [
  { code: "CN-BJ", zh: "北京", en: "Beijing" },
  { code: "CN-TJ", zh: "天津", en: "Tianjin" },
  { code: "CN-HE", zh: "河北", en: "Hebei" },
  { code: "CN-SX", zh: "山西", en: "Shanxi" },
  { code: "CN-NM", zh: "内蒙古", en: "Inner Mongolia" },
  { code: "CN-LN", zh: "辽宁", en: "Liaoning" },
  { code: "CN-JL", zh: "吉林", en: "Jilin" },
  { code: "CN-HL", zh: "黑龙江", en: "Heilongjiang" },
  { code: "CN-SH", zh: "上海", en: "Shanghai" },
  { code: "CN-JS", zh: "江苏", en: "Jiangsu" },
  { code: "CN-ZJ", zh: "浙江", en: "Zhejiang" },
  { code: "CN-AH", zh: "安徽", en: "Anhui" },
  { code: "CN-FJ", zh: "福建", en: "Fujian" },
  { code: "CN-JX", zh: "江西", en: "Jiangxi" },
  { code: "CN-SD", zh: "山东", en: "Shandong" },
  { code: "CN-HA", zh: "河南", en: "Henan" },
  { code: "CN-HB", zh: "湖北", en: "Hubei" },
  { code: "CN-HN", zh: "湖南", en: "Hunan" },
  { code: "CN-GD", zh: "广东", en: "Guangdong" },
  { code: "CN-GX", zh: "广西", en: "Guangxi" },
  { code: "CN-HI", zh: "海南", en: "Hainan" },
  { code: "CN-CQ", zh: "重庆", en: "Chongqing" },
  { code: "CN-SC", zh: "四川", en: "Sichuan" },
  { code: "CN-GZ", zh: "贵州", en: "Guizhou" },
  { code: "CN-YN", zh: "云南", en: "Yunnan" },
  { code: "CN-XZ", zh: "西藏", en: "Tibet" },
  { code: "CN-SN", zh: "陕西", en: "Shaanxi" },
  { code: "CN-GS", zh: "甘肃", en: "Gansu" },
  { code: "CN-QH", zh: "青海", en: "Qinghai" },
  { code: "CN-NX", zh: "宁夏", en: "Ningxia" },
  { code: "CN-XJ", zh: "新疆", en: "Xinjiang" },
];

// 港澳台在多数 IP 库中以独立国家/地区代码返回
export const CN_SPECIAL_REGIONS: RegionOption[] = [
  { code: "HK", zh: "香港", en: "Hong Kong" },
  { code: "MO", zh: "澳门", en: "Macao" },
  { code: "TW", zh: "台湾", en: "Taiwan" },
];

export const US_STATES: RegionOption[] = [
  { code: "US-AL", zh: "阿拉巴马州", en: "Alabama" },
  { code: "US-AK", zh: "阿拉斯加州", en: "Alaska" },
  { code: "US-AZ", zh: "亚利桑那州", en: "Arizona" },
  { code: "US-AR", zh: "阿肯色州", en: "Arkansas" },
  { code: "US-CA", zh: "加利福尼亚州", en: "California" },
  { code: "US-CO", zh: "科罗拉多州", en: "Colorado" },
  { code: "US-CT", zh: "康涅狄格州", en: "Connecticut" },
  { code: "US-DE", zh: "特拉华州", en: "Delaware" },
  { code: "US-DC", zh: "华盛顿特区", en: "District of Columbia" },
  { code: "US-FL", zh: "佛罗里达州", en: "Florida" },
  { code: "US-GA", zh: "佐治亚州", en: "Georgia" },
  { code: "US-HI", zh: "夏威夷州", en: "Hawaii" },
  { code: "US-ID", zh: "爱达荷州", en: "Idaho" },
  { code: "US-IL", zh: "伊利诺伊州", en: "Illinois" },
  { code: "US-IN", zh: "印第安纳州", en: "Indiana" },
  { code: "US-IA", zh: "艾奥瓦州", en: "Iowa" },
  { code: "US-KS", zh: "堪萨斯州", en: "Kansas" },
  { code: "US-KY", zh: "肯塔基州", en: "Kentucky" },
  { code: "US-LA", zh: "路易斯安那州", en: "Louisiana" },
  { code: "US-ME", zh: "缅因州", en: "Maine" },
  { code: "US-MD", zh: "马里兰州", en: "Maryland" },
  { code: "US-MA", zh: "马萨诸塞州", en: "Massachusetts" },
  { code: "US-MI", zh: "密歇根州", en: "Michigan" },
  { code: "US-MN", zh: "明尼苏达州", en: "Minnesota" },
  { code: "US-MS", zh: "密西西比州", en: "Mississippi" },
  { code: "US-MO", zh: "密苏里州", en: "Missouri" },
  { code: "US-MT", zh: "蒙大拿州", en: "Montana" },
  { code: "US-NE", zh: "内布拉斯加州", en: "Nebraska" },
  { code: "US-NV", zh: "内华达州", en: "Nevada" },
  { code: "US-NH", zh: "新罕布什尔州", en: "New Hampshire" },
  { code: "US-NJ", zh: "新泽西州", en: "New Jersey" },
  { code: "US-NM", zh: "新墨西哥州", en: "New Mexico" },
  { code: "US-NY", zh: "纽约州", en: "New York" },
  { code: "US-NC", zh: "北卡罗来纳州", en: "North Carolina" },
  { code: "US-ND", zh: "北达科他州", en: "North Dakota" },
  { code: "US-OH", zh: "俄亥俄州", en: "Ohio" },
  { code: "US-OK", zh: "俄克拉何马州", en: "Oklahoma" },
  { code: "US-OR", zh: "俄勒冈州", en: "Oregon" },
  { code: "US-PA", zh: "宾夕法尼亚州", en: "Pennsylvania" },
  { code: "US-RI", zh: "罗得岛州", en: "Rhode Island" },
  { code: "US-SC", zh: "南卡罗来纳州", en: "South Carolina" },
  { code: "US-SD", zh: "南达科他州", en: "South Dakota" },
  { code: "US-TN", zh: "田纳西州", en: "Tennessee" },
  { code: "US-TX", zh: "得克萨斯州", en: "Texas" },
  { code: "US-UT", zh: "犹他州", en: "Utah" },
  { code: "US-VT", zh: "佛蒙特州", en: "Vermont" },
  { code: "US-VA", zh: "弗吉尼亚州", en: "Virginia" },
  { code: "US-WA", zh: "华盛顿州", en: "Washington" },
  { code: "US-WV", zh: "西弗吉尼亚州", en: "West Virginia" },
  { code: "US-WI", zh: "威斯康星州", en: "Wisconsin" },
  { code: "US-WY", zh: "怀俄明州", en: "Wyoming" },
];

const ALL_REGIONS = [...CN_PROVINCES, ...CN_SPECIAL_REGIONS, ...US_STATES];

export function regionLabel(code: string, lang: string): string {
  const option = ALL_REGIONS.find((r) => r.code === code);
  if (!option) return code;
  return lang.startsWith("zh") ? option.zh : option.en;
}

export function parseRegionList(value: string): string[] {
  return Array.from(
    new Set(
      (value || "")
        .split(/[\s,;，；、]+/)
        .map((s) => s.trim().toUpperCase().replace(/_/g, "-"))
        .filter(Boolean)
    )
  );
}
