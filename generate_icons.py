#!/usr/bin/env python3
"""
生成 PWA 和 PC 端所需的各种尺寸图标
先裁剪白色区域，再生成标准尺寸
"""
from PIL import Image
import os

# 源图片路径
source_image = "/Users/shasenggenwolai/Documents/trae_projects/miniflowy0.2.9/frontend/public/miniflowy.png"
output_dir = "/Users/shasenggenwolai/Documents/trae_projects/miniflowy0.2.9/frontend/public/icons"

def trim_white_background(img):
    """裁剪图片周围的白色/透明背景"""
    # 转换为 RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 获取图片数据
    datas = img.getdata()
    
    # 找到非白色/非透明像素的边界
    width, height = img.size
    left = width
    right = 0
    top = height
    bottom = 0
    
    for y in range(height):
        for x in range(width):
            pixel = datas[y * width + x]
            # 检查是否为非白色且非透明
            # 白色阈值：RGB 都大于 240
            # 透明阈值：Alpha 大于 10
            r, g, b, a = pixel
            is_white = r > 240 and g > 240 and b > 240
            is_transparent = a < 10
            
            if not is_white and not is_transparent:
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
    
    # 添加一些边距
    padding = 10
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(width - 1, right + padding)
    bottom = min(height - 1, bottom + padding)
    
    # 裁剪
    cropped = img.crop((left, top, right + 1, bottom + 1))
    return cropped

def make_square(img, bg_color=(255, 255, 255, 0)):
    """将图片变为正方形，保持内容居中"""
    width, height = img.size
    
    if width == height:
        return img
    
    # 计算新尺寸
    new_size = max(width, height)
    
    # 创建新图片
    new_img = Image.new('RGBA', (new_size, new_size), bg_color)
    
    # 计算粘贴位置（居中）
    x = (new_size - width) // 2
    y = (new_size - height) // 2
    
    # 粘贴原图
    new_img.paste(img, (x, y), img)
    
    return new_img

def generate_icons():
    # 打开源图片
    img = Image.open(source_image)
    print(f"Original size: {img.size}")
    
    # 裁剪白色背景
    trimmed = trim_white_background(img)
    print(f"Trimmed size: {trimmed.size}")
    
    # 变为正方形（透明背景）
    square_img = make_square(trimmed, bg_color=(255, 255, 255, 0))
    print(f"Square size: {square_img.size}")
    
    # 保存处理后的源图
    processed_path = "/Users/shasenggenwolai/Documents/trae_projects/miniflowy0.2.9/frontend/public/miniflowy_processed.png"
    square_img.save(processed_path, 'PNG')
    print(f"Saved processed image: {processed_path}")
    
    # 需要生成的尺寸列表 (PWA 和 PC 端所需)
    sizes = [
        (16, "icon-16x16.png"),       # Favicon
        (32, "icon-32x32.png"),       # Favicon
        (48, "icon-48x48.png"),       # PWA
        (72, "icon-72x72.png"),       # PWA
        (96, "icon-96x96.png"),       # PWA
        (120, "icon-120x120.png"),    # Apple touch
        (128, "icon-128x128.png"),    # PWA
        (144, "icon-144x144.png"),    # PWA
        (152, "icon-152x152.png"),    # Apple touch
        (180, "icon-180x180.png"),    # Apple touch
        (192, "icon-192x192.png"),    # PWA
        (384, "icon-384x384.png"),    # PWA
        (512, "icon-512x512.png"),    # PWA
    ]
    
    # 生成各种尺寸
    for size, filename in sizes:
        resized = square_img.resize((size, size), Image.Resampling.LANCZOS)
        output_path = os.path.join(output_dir, filename)
        resized.save(output_path, 'PNG')
        print(f"Generated: {filename} ({size}x{size})")
    
    # 同时生成 Apple touch icon
    apple_icon = square_img.resize((180, 180), Image.Resampling.LANCZOS)
    apple_icon_path = os.path.join(os.path.dirname(output_dir), "apple-touch-icon.png")
    apple_icon.save(apple_icon_path, 'PNG')
    print(f"Generated: apple-touch-icon.png (180x180)")
    
    # 生成 maskable icon (512x512，用于 Android 自适应图标)
    # maskable 图标需要有边距，内容在中心安全区域
    maskable_size = 512
    maskable = Image.new('RGBA', (maskable_size, maskable_size), (255, 255, 255, 0))
    # 内容占 80% 的区域，留出边距
    content_size = int(maskable_size * 0.8)
    content = square_img.resize((content_size, content_size), Image.Resampling.LANCZOS)
    x = (maskable_size - content_size) // 2
    y = (maskable_size - content_size) // 2
    maskable.paste(content, (x, y), content)
    maskable_path = os.path.join(os.path.dirname(output_dir), "maskable-icon.png")
    maskable.save(maskable_path, 'PNG')
    print(f"Generated: maskable-icon.png (512x512 with padding)")
    
    print("\nAll icons generated successfully!")

if __name__ == "__main__":
    generate_icons()
