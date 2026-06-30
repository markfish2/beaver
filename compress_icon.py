#!/usr/bin/env python3
"""
压缩 miniflowy.png 图标文件
"""
from PIL import Image
import os

# 源文件
source_file = "/Users/shasenggenwolai/Documents/trae_projects/miniflowy0.2.9/frontend/public/miniflowy.png"
output_file = "/Users/shasenggenwolai/Documents/trae_projects/miniflowy0.2.9/frontend/public/miniflowy_compressed.png"

def compress_image():
    # 打开图片
    img = Image.open(source_file)
    print(f"Original size: {img.size}")
    print(f"Original mode: {img.mode}")
    
    # 如果图片太大，可以缩小尺寸
    # 保留为 1024x1024，这对网页图标来说已经足够大了
    target_size = 1024
    if img.size[0] > target_size or img.size[1] > target_size:
        img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
        print(f"Resized to: {img.size}")
    
    # 转换为 RGB 模式（去除透明通道，减少文件大小）
    # 或者保持 RGBA 如果需要透明背景
    if img.mode == 'RGBA':
        # 创建白色背景
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])  # 使用 alpha 通道作为 mask
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # 保存为 PNG，使用优化
    img.save(output_file, 'PNG', optimize=True)
    
    # 检查文件大小
    original_size = os.path.getsize(source_file)
    compressed_size = os.path.getsize(output_file)
    
    print(f"Original file size: {original_size / 1024 / 1024:.2f} MB")
    print(f"Compressed file size: {compressed_size / 1024 / 1024:.2f} MB")
    print(f"Reduction: {(1 - compressed_size / original_size) * 100:.1f}%")
    
    # 替换原文件
    os.replace(output_file, source_file)
    print(f"Replaced original file with compressed version")

if __name__ == "__main__":
    compress_image()
