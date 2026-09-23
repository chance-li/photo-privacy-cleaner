export type FieldGroup =
  | 'time'
  | 'location'
  | 'device'
  | 'identity'
  | 'software'
  | 'capture'
  | 'other'

export interface FieldMeta {
  label: string
  group: FieldGroup
  sensitive: boolean
}

export const GROUP_LABELS: Record<FieldGroup, string> = {
  time: '时间',
  location: '地点',
  device: '相机与设备',
  identity: '作者、版权与身份',
  software: '软件',
  capture: '拍摄参数',
  other: '其他',
}

export const GROUP_ORDER: FieldGroup[] = [
  'time',
  'location',
  'device',
  'identity',
  'software',
  'capture',
  'other',
]

const FIELD_DICTIONARY: Record<string, FieldMeta> = {
  DateTimeOriginal: { label: '拍摄时间', group: 'time', sensitive: true },
  CreateDate: { label: '创建时间', group: 'time', sensitive: true },
  ModifyDate: { label: '修改时间', group: 'time', sensitive: true },
  DateTimeDigitized: { label: '数字化时间', group: 'time', sensitive: true },
  DateTime: { label: '文件时间', group: 'time', sensitive: true },
  SubSecTimeOriginal: { label: '拍摄时间亚秒', group: 'time', sensitive: true },
  SubSecTimeDigitized: { label: '数字化亚秒', group: 'time', sensitive: true },
  SubSecTime: { label: '亚秒', group: 'time', sensitive: true },
  OffsetTime: { label: '时区偏移', group: 'time', sensitive: true },
  OffsetTimeOriginal: { label: '拍摄时区', group: 'time', sensitive: true },
  OffsetTimeDigitized: { label: '数字化时区', group: 'time', sensitive: true },
  GPSDateStamp: { label: 'GPS 日期', group: 'time', sensitive: true },
  GPSTimeStamp: { label: 'GPS 时间', group: 'time', sensitive: true },
  DateCreated: { label: 'IPTC 日期', group: 'time', sensitive: true },
  TimeCreated: { label: 'IPTC 时间', group: 'time', sensitive: true },
  MetadataDate: { label: '元数据时间', group: 'time', sensitive: true },
  latitude: { label: '纬度', group: 'location', sensitive: true },
  longitude: { label: '经度', group: 'location', sensitive: true },
  GPSAltitude: { label: '海拔', group: 'location', sensitive: true },
  GPSImgDirection: { label: '拍摄方向', group: 'location', sensitive: true },
  GPSDestLatitude: { label: '目标纬度', group: 'location', sensitive: true },
  GPSDestLongitude: { label: '目标经度', group: 'location', sensitive: true },
  GPSProcessingMethod: { label: 'GPS 处理方式', group: 'location', sensitive: true },
  GPSAreaInformation: { label: 'GPS 区域', group: 'location', sensitive: true },
  GPSMapDatum: { label: '地图基准', group: 'location', sensitive: true },
  City: { label: '城市', group: 'location', sensitive: true },
  'Province-State': { label: '省/州', group: 'location', sensitive: true },
  'Country-PrimaryLocationName': { label: '国家', group: 'location', sensitive: true },
  'Country-PrimaryLocationCode': { label: '国家代码', group: 'location', sensitive: true },
  'Sub-location': { label: '具体地点', group: 'location', sensitive: true },
  Location: { label: '地点名称', group: 'location', sensitive: true },
  Country: { label: '国家', group: 'location', sensitive: true },
  State: { label: '省/州', group: 'location', sensitive: true },
  Make: { label: '相机品牌', group: 'device', sensitive: true },
  Model: { label: '相机型号', group: 'device', sensitive: true },
  LensMake: { label: '镜头品牌', group: 'device', sensitive: true },
  LensModel: { label: '镜头型号', group: 'device', sensitive: true },
  LensSerialNumber: { label: '镜头序列号', group: 'device', sensitive: true },
  SerialNumber: { label: '序列号', group: 'device', sensitive: true },
  BodySerialNumber: { label: '机身序列号', group: 'device', sensitive: true },
  InternalSerialNumber: { label: '内部序列号', group: 'device', sensitive: true },
  CameraSerialNumber: { label: '相机序列号', group: 'device', sensitive: true },
  Orientation: { label: '画面方向', group: 'device', sensitive: false },
  Artist: { label: '作者', group: 'identity', sensitive: true },
  Copyright: { label: '版权', group: 'identity', sensitive: true },
  CopyrightNotice: { label: '版权声明', group: 'identity', sensitive: true },
  Creator: { label: '创建者', group: 'identity', sensitive: true },
  'By-line': { label: '署名', group: 'identity', sensitive: true },
  Byline: { label: '署名', group: 'identity', sensitive: true },
  'By-lineTitle': { label: '署名头衔', group: 'identity', sensitive: true },
  Credit: { label: '署名来源', group: 'identity', sensitive: true },
  Source: { label: '来源', group: 'identity', sensitive: true },
  OwnerName: { label: '所有者', group: 'identity', sensitive: true },
  CameraOwnerName: { label: '相机所有者', group: 'identity', sensitive: true },
  ImageDescription: { label: '图像描述', group: 'identity', sensitive: true },
  UserComment: { label: '用户注释', group: 'identity', sensitive: true },
  DocumentName: { label: '文档名称', group: 'identity', sensitive: true },
  ImageUniqueID: { label: '图像唯一编号', group: 'identity', sensitive: true },
  XPAuthor: { label: 'Windows 作者', group: 'identity', sensitive: true },
  XPComment: { label: 'Windows 注释', group: 'identity', sensitive: true },
  XPKeywords: { label: 'Windows 关键词', group: 'identity', sensitive: true },
  XPTitle: { label: 'Windows 标题', group: 'identity', sensitive: true },
  XPSubject: { label: 'Windows 主题', group: 'identity', sensitive: true },
  Headline: { label: '标题', group: 'identity', sensitive: true },
  'Caption-Abstract': { label: '说明', group: 'identity', sensitive: true },
  Keywords: { label: '关键词', group: 'identity', sensitive: true },
  ObjectName: { label: '对象名称', group: 'identity', sensitive: true },
  SpecialInstructions: { label: '特殊说明', group: 'identity', sensitive: true },
  'Writer-Editor': { label: '撰稿人', group: 'identity', sensitive: true },
  Rights: { label: '权利声明', group: 'identity', sensitive: true },
  Description: { label: '描述', group: 'identity', sensitive: true },
  Title: { label: '标题', group: 'identity', sensitive: true },
  Label: { label: '标记', group: 'identity', sensitive: true },
  Software: { label: '软件', group: 'software', sensitive: true },
  ProcessingSoftware: { label: '处理软件', group: 'software', sensitive: true },
  HostComputer: { label: '主机', group: 'software', sensitive: true },
  CreatorTool: { label: '创建工具', group: 'software', sensitive: true },
  History: { label: '编辑历史', group: 'software', sensitive: true },
  ExposureTime: { label: '快门', group: 'capture', sensitive: false },
  FNumber: { label: '光圈', group: 'capture', sensitive: false },
  ISO: { label: 'ISO', group: 'capture', sensitive: false },
  ISOSpeedRatings: { label: 'ISO', group: 'capture', sensitive: false },
  FocalLength: { label: '焦距', group: 'capture', sensitive: false },
  FocalLengthIn35mmFormat: { label: '等效焦距', group: 'capture', sensitive: false },
  ExposureProgram: { label: '曝光程序', group: 'capture', sensitive: false },
  ExposureBiasValue: { label: '曝光补偿', group: 'capture', sensitive: false },
  MeteringMode: { label: '测光模式', group: 'capture', sensitive: false },
  Flash: { label: '闪光灯', group: 'capture', sensitive: false },
  WhiteBalance: { label: '白平衡', group: 'capture', sensitive: false },
  ApertureValue: { label: '光圈值', group: 'capture', sensitive: false },
  ShutterSpeedValue: { label: '快门速度', group: 'capture', sensitive: false },
}

const ORIENTATION_LABELS: Record<string, string> = {
  '1': '正常',
  '2': '水平翻转',
  '3': '旋转 180°',
  '4': '垂直翻转',
  '5': '逆时针 90° 并水平翻转',
  '6': '顺时针 90°',
  '7': '顺时针 90° 并水平翻转',
  '8': '逆时针 90°',
  'Horizontal (normal)': '正常',
  'Mirror horizontal': '水平翻转',
  'Rotate 180': '旋转 180°',
  'Mirror vertical': '垂直翻转',
  'Mirror horizontal and rotate 270 CW': '逆时针 90° 并水平翻转',
  'Rotate 90 CW': '顺时针 90°',
  'Mirror horizontal and rotate 90 CW': '顺时针 90° 并水平翻转',
  'Rotate 270 CW': '逆时针 90°',
}

export function leafKey(key: string): string {
  const withoutIndex = key.replace(/\[\d+\]/g, '')
  const parts = withoutIndex.split('.')
  return parts[parts.length - 1] || key
}

export function classifyField(key: string): FieldMeta {
  const parts = key.replace(/\[\d+\]/g, '').split('.').filter(Boolean)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const known = lookupField(parts[index])
    if (known) return known
  }
  const leaf = leafKey(key)
  return {
    label: key === leaf ? leaf : key,
    group: inferGroup(key),
    sensitive: inferSensitive(key),
  }
}

function lookupField(name: string): FieldMeta | undefined {
  if (name === 'value' || name === 'lang' || name === 'li') return undefined
  if (FIELD_DICTIONARY[name]) return FIELD_DICTIONARY[name]
  const match = Object.keys(FIELD_DICTIONARY).find((key) => key.toLowerCase() === name.toLowerCase())
  return match ? FIELD_DICTIONARY[match] : undefined
}

export function orientationLabel(value: string): string | null {
  return ORIENTATION_LABELS[value] ?? null
}

function inferGroup(key: string): FieldGroup {
  if (/datetime|timestamp|datecreated|timecreated|subsec|offsettime|modifydate|createdate|metadatadate|^date$|^time$/i.test(key)) {
    return 'time'
  }
  if (/gps|latitude|longitude|altitude|city|country|location|province|sub-location/i.test(key)) {
    return 'location'
  }
  if (/software|creatortool|hostcomputer|processing/i.test(key)) return 'software'
  if (/artist|author|copyright|creator|owner|credit|comment|description|keyword|person|rights|by-line|headline|caption/i.test(key)) {
    return 'identity'
  }
  if (/make|model|serial|lens|camera/i.test(key)) return 'device'
  if (/exposure|fnumber|iso|focal|aperture|flash|metering|whitebalance|shutter/i.test(key)) {
    return 'capture'
  }
  return 'other'
}

function inferSensitive(key: string): boolean {
  return /gps|latitude|longitude|altitude|serial|owner|artist|author|copyright|creator|credit|by-line|comment|description|software|datetime|timestamp|city|country|location|province|email|phone|keyword|subject|person|contact|document|lens|make|model|hostcomputer|processing|uniqueid|rights|headline|caption|writer|identifier|history|camera|creatortool/i.test(
    key,
  )
}
