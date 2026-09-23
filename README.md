# 净照 · 照片隐私清除

在浏览器里查看并清除照片中的隐私元数据。拍摄时间、GPS 位置、相机序列号、作者和版权常常藏在 EXIF、IPTC、XMP 里。照片不会上传，处理全程发生在你自己的设备上。

灵感来自 Phil Harvey 的 [ExifTool](https://github.com/exiftool/exiftool)：读取图像元数据，再把可移除的部分清掉。这里没有嵌入 ExifTool 的 Perl 代码，而是用浏览器里能维护的方式做同一件事。

## 本地运行

```bash
npm install
npm run dev
```

打开 <http://localhost:5173>。

其他命令：

```bash
npm test          # 用同一套读取器核对清除前后
npm run build     # 类型检查并构建
npm run preview   # 预览构建结果
npm run sample    # 重新生成 public/samples 里的示例照片
```

## 怎么用

1. 把 JPEG、PNG、WebP 或 HEIC 拖进页面，或点击选择文件。也可以先试用仓库里的示例。
2. 查看拍摄时间、地点、相机与设备、作者版权和软件。没有这些字段时，页面会直接说明。
3. 点击 **清除元数据**。JPEG、PNG、WebP 不重新压缩像素；HEIC 会先解码成 JPEG。
4. 对照清除前后的字段，再下载 `原文件名_已清除`。

画面方向（Orientation 为 2–8 时）和色彩配置（ICC）会保留，避免照片转歪或变色。文件末尾的附加数据（例如部分动态照片的视频尾部）会去掉。

点击地图链接时，坐标才会发给 OpenStreetMap，照片本身仍然不会上传。单张文件上限 40 MB。

## 示例照片

`public/samples/demo-with-exif.jpg` 是合成风景，不是实拍。写入的隐私字段：

| 字段 | 值 |
| --- | --- |
| 拍摄时间 | 2024-08-01 19:45:12 |
| 纬度 / 经度 | 北纬 31.23000°，东经 121.47000° |
| 设备 | Apple iPhone 15，序列号 SN123456789 |
| 作者 | Zhang San，XMP / IPTC 中还有「张三」「上海」 |

`public/samples/demo-plain.jpg` 是同一画面，没有这些元数据，用来看空状态。

## 技术选型

- [Vite](https://vite.dev/) + React + TypeScript。界面在本地开发服务器里跑，没有后端，原图不会落盘。
- [exifr](https://github.com/MikeKovarik/exifr) 读取 JPEG、PNG、TIFF/HEIC 里的 EXIF、GPS、IPTC、XMP。WebP 的 EXIF 块会先拆出来再交给 exifr；XMP 块包进一个只含这段 XMP 的 JPEG 再解析，因此清除前后用的是同一个读取器。
- 清除由 `src/lib/stripMetadata.ts` 完成，不把像素解码后再编码。没有使用 piexifjs 做正式清除：它只去掉 JPEG 里的 Exif APP1，不管 IPTC、XMP、PNG 文本块和 WebP 块。
- HEIC：优先用浏览器自己的解码；不行时再动态加载 [heic-to](https://github.com/hoppergee/heic-to)（LGPL-3.0，内含 libheif）。这一包大约 3 MB，只有选择 HEIC 时才会下载，然后把结果存成 JPEG 并再清一遍。
- 开发和测试才用 piexifjs、jpeg-js：生成带 EXIF/GPS 的样图，并用像素对比确认 JPEG 画面没有被重编码。

## 清除原理

和 ExifTool 去掉元数据段、而不是整张重存的思路一致。

**JPEG。** 按标记遍历文件。删掉 APP1（EXIF 与 XMP）、APP13（IPTC / Photoshop）、注释（COM），以及其他 APP 段。留下 APP0（JFIF）、以 `ICC_PROFILE` 开头的 APP2，以及 Adobe APP14。扫描数据按字节复制，包括 `FF 00` 填充和重启标记，所以渐进式 JPEG 的多段扫描也还在。文件在 EOI 之后的尾巴会被丢掉。若原图方向是 2–8，会写回一个只含 Orientation 的最小 EXIF。

**PNG。** 保留重建画面所需的关键块，以及颜色、透明和 APNG 动画用的辅助块。`tEXt`、`zTXt`、`iTXt`、`eXIf`、`tIME` 和其他来历不明的辅助块会去掉。需要时再写回只含方向的 `eXIf`。

**WebP。** 去掉 `EXIF` 和 `XMP ` 块，并清掉 VP8X 里对应的标志。`VP8` / `VP8L` 图像数据原样保留。如果扩展头上已经没有任何特性，就退回普通 WebP。

**HEIC。** 容器是 ISOBMFF，可靠地无损拆元数据需要完整改写文件。这里改成解码后另存 JPEG，画质会有轻微变化，新文件不再写入时间、位置和身份信息。

## 测试

`npm test` 会：

- 造一张带拍摄时间、GPS、序列号、XMP、IPTC 和注释的 JPEG，用 exifr 读出这些字段，清除后再用 exifr 确认它们消失，并用 jpeg-js 对比像素。
- 对 PNG、WebP 做同样的读取 / 清除 / 再读取，并确认图像数据块没有改动。
- 检查仓库里的示例照片。

## English

Jingzhao is a client-side photo privacy cleaner. Drop a JPEG, PNG, WebP, or HEIC, inspect capture time, GPS, camera, author, and copyright metadata in Chinese, then strip it and download the result. Nothing is uploaded.

```bash
npm install
npm run dev
```

The implementation follows ExifTool’s idea of removing metadata containers rather than shipping the Perl ExifTool tree. JPEG, PNG, and WebP are stripped losslessly (pixels are copied through). Orientation and ICC profiles are kept so the picture does not rotate or shift color. HEIC is decoded to JPEG because a safe lossless ISOBMFF rewrite is a different project. `npm test` reads the fixture with exifr, strips it, and reads it again with exifr to prove the time and location are gone.
