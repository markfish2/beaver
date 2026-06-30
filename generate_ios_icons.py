#!/usr/bin/env python3
"""
iOS 优化的 PWA 图标生成器
解决 iOS 26 白边问题：完全填充，无透明背景，考虑圆角安全区
"""
from PIL import Image, ImageDraw
import os
import sys

# 项目根目录
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'public')
ICONS_DIR = os.path.join(PUBLIC_DIR, 'icons')

# iOS 图标配置
IOS_CONFIG = {
    'background_color': (255, 255, 255, 255),  # 纯白色背景（完全不透明）
    'content_ratio': 1.0,  # 源图已有padding，直接填满画布
    'corner_radius_ratio': 0.225,  # iOS 圆角半径比例
}

def load_source_icon():
    """加载源图标文件，并裁剪白色边距"""
    # 优先使用项目根目录的 logo.png
    root_logo = os.path.join(PROJECT_ROOT, 'logo.png')
    png_path = os.path.join(PUBLIC_DIR, 'beaver.png')
    svg_path = os.path.join(PUBLIC_DIR, 'beaver.svg')

    if os.path.exists(root_logo):
        print(f"✓ 加载源图标: {root_logo}")
        img = Image.open(root_logo).convert('RGBA')
        # 同时覆盖 public/beaver.png
        img.convert('RGB').save(png_path, 'PNG', quality=95)
        print(f"✓ 已覆盖: {png_path}")
    elif os.path.exists(png_path):
        print(f"✓ 加载源图标: {png_path}")
        img = Image.open(png_path).convert('RGBA')
    elif os.path.exists(svg_path):
        print(f"⚠ SVG 需要转换，请先准备 PNG 格式的源图标")
        sys.exit(1)
    else:
        print(f"✗ 找不到源图标文件")
        sys.exit(1)

    # 裁剪白色边距：找到非白色内容的边界框
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    top = left = 0
    bottom, right = h - 1, w - 1

    # 从四边向内扫描，找到第一个非白色像素
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not (r > 250 and g > 250 and b > 250):
                top = y
                break
        else:
            continue
        break
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b = px[x, y]
            if not (r > 250 and g > 250 and b > 250):
                bottom = y
                break
        else:
            continue
        break
    for x in range(w):
        for y in range(h):
            r, g, b = px[x, y]
            if not (r > 250 and g > 250 and b > 250):
                left = x
                break
        else:
            continue
        break
    for x in range(w - 1, -1, -1):
        for y in range(h):
            r, g, b = px[x, y]
            if not (r > 250 and g > 250 and b > 250):
                right = x
                break
        else:
            continue
        break

    content_w = right - left + 1
    content_h = bottom - top + 1
    if content_w < w or content_h < h:
        img = img.crop((left, top, right + 1, bottom + 1))
        print(f"✓ 裁剪白色边距: {w}x{h} → {img.size[0]}x{img.size[1]}")

    # 裁剪为正方形（取短边，居中裁剪）
    w2, h2 = img.size
    if w2 != h2:
        side = min(w2, h2)
        cx, cy = w2 // 2, h2 // 2
        img = img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
        print(f"✓ 裁剪为正方形: {img.size[0]}x{img.size[1]}")

    return img

def create_ios_optimized_icon(source_img, target_size):
    """
    创建 iOS 优化的图标
    - 完全填充（无透明）
    - 考虑圆角安全区
    - 内容居中
    """
    # 创建画布（纯白色背景）
    canvas = Image.new('RGBA', (target_size, target_size), IOS_CONFIG['background_color'])

    # 计算安全区域（iOS 圆角会裁剪约 18%）
    safe_area_size = int(target_size * IOS_CONFIG['content_ratio'])
    padding = (target_size - safe_area_size) // 2

    # 调整源图标尺寸（保持宽高比）
    source_ratio = source_img.width / source_img.height
    if source_ratio > 1:
        # 宽图
        new_width = safe_area_size
        new_height = int(new_width / source_ratio)
    else:
        # 高图或正方形
        new_height = safe_area_size
        new_width = int(new_height * source_ratio)

    # 使用高质量缩放
    resized = source_img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # 居中粘贴
    paste_x = (target_size - new_width) // 2
    paste_y = (target_size - new_height) // 2

    # 如果源图有透明通道，使用 alpha 作为 mask
    if resized.mode == 'RGBA':
        canvas.paste(resized, (paste_x, paste_y), resized)
    else:
        canvas.paste(resized, (paste_x, paste_y))

    return canvas

def apply_rounded_corners(img, radius_ratio):
    """应用 iOS 风格的圆角（仅供参考，实际由 iOS 系统处理）"""
    width, height = img.size
    radius = int(width * radius_ratio)

    # 创建圆角 mask
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (width, height)], radius=radius, fill=255)

    # 应用 mask
    result = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    result.paste(img, mask=mask)

    return result

def generate_ios_icons():
    """生成所有 iOS 需要的图标尺寸"""
    print("=" * 60)
    print("iOS 优化图标生成器")
    print("=" * 60)

    # 加载源图标
    source_img = load_source_icon()
    print(f"✓ 源图标尺寸: {source_img.size}")

    # iOS 标准尺寸
    ios_sizes = [
        (180, 'apple-touch-icon.png'),  # iPhone 6+ (最重要)
        (120, 'icon-120x120.png'),      # iPhone
        (152, 'icon-152x152.png'),      # iPad
        (167, 'icon-167x167.png'),      # iPad Pro
        (180, 'icon-180x180.png'),      # iPhone 6+ 备用
    ]

    # 生成 iOS 图标
    print("\n📱 生成 iOS 图标...")
    for size, filename in ios_sizes:
        icon = create_ios_optimized_icon(source_img, size)

        # 保存到 icons 目录
        icon_path = os.path.join(ICONS_DIR, filename)
        # iOS 图标必须是 RGB（不支持 RGBA）
        icon_rgb = icon.convert('RGB')
        icon_rgb.save(icon_path, 'PNG', quality=95)
        print(f"  ✓ {filename} ({size}x{size})")

        # 同时保存到 public 根目录（苹果标准位置）
        if filename == 'apple-touch-icon.png':
            root_path = os.path.join(PUBLIC_DIR, filename)
            icon_rgb.save(root_path, 'PNG', quality=95)
            print(f"  ✓ 根目录: {filename}")

    # 同时生成 PWA 标准尺寸
    print("\🌐 生成 PWA 标准尺寸...")
    pwa_sizes = [
        (72, 'icon-72x72.png'),
        (96, 'icon-96x96.png'),
        (128, 'icon-128x128.png'),
        (144, 'icon-144x144.png'),
        (192, 'icon-192x192.png'),
        (384, 'icon-384x384.png'),
        (512, 'icon-512x512.png'),
    ]

    for size, filename in pwa_sizes:
        icon = create_ios_optimized_icon(source_img, size)
        icon_path = os.path.join(ICONS_DIR, filename)
        icon_rgb = icon.convert('RGB')
        icon_rgb.save(icon_path, 'PNG', quality=95)
        print(f"  ✓ {filename} ({size}x{size})")

    # 生成主图标
    print("\🎨 生成主图标...")
    main_icon = create_ios_optimized_icon(source_img, 512)
    main_icon_rgb = main_icon.convert('RGB')
    main_icon_rgb.save(os.path.join(PUBLIC_DIR, 'beaver.png'), 'PNG', quality=95)
    print(f"  ✓ beaver.png (512x512)")

    # 生成 maskable 图标（Android 自适应图标）
    print("\🤖 生成 Android maskable 图标...")
    maskable_size = 512
    maskable = create_ios_optimized_icon(source_img, maskable_size)
    # maskable 需要额外的安全边距
    maskable.save(os.path.join(PUBLIC_DIR, 'maskable-icon.png'), 'PNG', quality=95)
    print(f"  ✓ maskable-icon.png (512x512)")

    # 生成预览图（带圆角，用于调试）
    print("\🔍 生成预览图（带圆角）...")
    preview = create_ios_optimized_icon(source_img, 512)
    preview_rounded = apply_rounded_corners(preview, IOS_CONFIG['corner_radius_ratio'])
    preview_rounded.save(os.path.join(PUBLIC_DIR, 'icon-preview.png'), 'PNG')
    print(f"  ✓ icon-preview.png (512x512, 带圆角)")

    print("\n" + "=" * 60)
    print("✅ 所有图标生成完成！")
    print("=" * 60)
    print("\n📋 iOS 图标优化要点：")
    print("  • 完全填充画布（无透明背景）")
    print("  • 纯白色背景（#FFFFFF）")
    print("  • 内容保持在安全区内（82%）")
    print("  • 无白边，iOS 裁剪圆角后完美显示")
    print("\n🚀 下一步：")
    print("  1. 在 iOS Safari 中测试 PWA 安装")
    print("  2. 检查桌面图标是否还有白边")
    print("  3. 如有问题，调整 content_ratio 参数")

if __name__ == '__main__':
    generate_ios_icons()
